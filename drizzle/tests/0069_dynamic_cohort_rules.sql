BEGIN;
DO $fixture$
DECLARE owner_ref uuid; manager_ref uuid:=gen_random_uuid(); learner_a uuid:=gen_random_uuid(); learner_b uuid:=gen_random_uuid(); manual_ref uuid:=gen_random_uuid(); outsider_ref uuid:=gen_random_uuid(); org_ref uuid:=gen_random_uuid(); other_org uuid:=gen_random_uuid(); dept_ref uuid:=gen_random_uuid(); child_ref uuid:=gen_random_uuid(); cohort_ref uuid:=gen_random_uuid();
BEGIN
  SELECT user_id INTO owner_ref FROM public.user_roles WHERE role='admin' LIMIT 1;
  INSERT INTO auth.users(id,aud,role,email,created_at,updated_at) VALUES(manager_ref,'authenticated','authenticated','rule-manager-'||manager_ref||'@example.invalid',now(),now()),(learner_a,'authenticated','authenticated','rule-a-'||learner_a||'@example.invalid',now(),now()),(learner_b,'authenticated','authenticated','rule-b-'||learner_b||'@example.invalid',now(),now()),(manual_ref,'authenticated','authenticated','rule-manual-'||manual_ref||'@example.invalid',now(),now()),(outsider_ref,'authenticated','authenticated','rule-outsider-'||outsider_ref||'@example.invalid',now(),now());
  PERFORM set_config('request.jwt.claim.sub',owner_ref::text,true);
  PERFORM public.save_organization(org_ref,'Dynamic rule company','','#123456',NULL,0); PERFORM public.save_organization(other_org,'Other rule company','','#654321',NULL,0);
  PERFORM public.save_organization_department(org_ref,dept_ref,'Operations',NULL,0); PERFORM public.save_organization_department(org_ref,child_ref,'Field team',dept_ref,0);
  PERFORM public.set_organization_member(org_ref,'rule-manager-'||manager_ref||'@example.invalid','manager',NULL,NULL,'Trainer',0);
  PERFORM public.set_organization_member(org_ref,'rule-a-'||learner_a||'@example.invalid','learner',dept_ref,NULL,'Field operator',0);
  PERFORM public.set_organization_member(org_ref,'rule-b-'||learner_b||'@example.invalid','learner',child_ref,NULL,'Field operator',0);
  PERFORM public.set_organization_member(org_ref,'rule-manual-'||manual_ref||'@example.invalid','learner',NULL,NULL,'Office analyst',0);
  PERFORM public.set_organization_member(other_org,'rule-outsider-'||outsider_ref||'@example.invalid','manager',NULL,NULL,'Other manager',0);
  PERFORM public.create_organization_cohort(org_ref,cohort_ref,'Rule-managed training'); PERFORM public.set_organization_cohort_member(cohort_ref,manual_ref,true);
  PERFORM set_config('test.rule_owner',owner_ref::text,true); PERFORM set_config('test.rule_manager',manager_ref::text,true); PERFORM set_config('test.rule_a',learner_a::text,true); PERFORM set_config('test.rule_b',learner_b::text,true); PERFORM set_config('test.rule_manual',manual_ref::text,true); PERFORM set_config('test.rule_outsider',outsider_ref::text,true);
  PERFORM set_config('test.rule_org',org_ref::text,true); PERFORM set_config('test.rule_other_org',other_org::text,true); PERFORM set_config('test.rule_dept',dept_ref::text,true); PERFORM set_config('test.rule_child',child_ref::text,true); PERFORM set_config('test.rule_cohort',cohort_ref::text,true);
END;
$fixture$;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub',current_setting('test.rule_manager'),true);
DO $preview_and_apply$
DECLARE preview jsonb; result jsonb; repeated jsonb; request_ref uuid:=gen_random_uuid();
BEGIN
  PERFORM public.save_cohort_assignment_rule(current_setting('test.rule_cohort')::uuid,current_setting('test.rule_dept')::uuid,true,'operator','learner',false,false,60,0);
  preview:=public.preview_cohort_assignment_rule(current_setting('test.rule_cohort')::uuid,1);
  IF (preview->>'add')::integer<>2 OR (preview->>'remove')::integer<>0 OR NOT (preview->>'capacity_ok')::boolean THEN RAISE EXCEPTION 'Department descendants or protected manual membership preview failed'; END IF;
  result:=public.run_cohort_assignment_rule(current_setting('test.rule_cohort')::uuid,1,preview->>'hash',request_ref);
  repeated:=public.run_cohort_assignment_rule(current_setting('test.rule_cohort')::uuid,1,preview->>'hash',request_ref);
  IF result<>repeated OR (result->>'added')::integer<>2 OR (result->>'removed')::integer<>0 THEN RAISE EXCEPTION 'Rule application or request retry failed'; END IF;
  PERFORM set_config('test.rule_id',(SELECT id::text FROM public.cohort_assignment_rules WHERE cohort_id=current_setting('test.rule_cohort')::uuid),true);
END;
$preview_and_apply$;
DO $manual_exclusion$
DECLARE preview jsonb; result jsonb;
BEGIN
  PERFORM public.set_organization_cohort_member(current_setting('test.rule_cohort')::uuid,current_setting('test.rule_a')::uuid,false);
  preview:=public.preview_cohort_assignment_rule(current_setting('test.rule_cohort')::uuid,1);
  IF (preview->>'add')::integer<>0 OR (preview->>'excluded')::integer<>1 THEN RAISE EXCEPTION 'Manual removal would be automatically reversed'; END IF;
  PERFORM public.allow_cohort_rule_member(current_setting('test.rule_cohort')::uuid,current_setting('test.rule_a')::uuid);
  preview:=public.preview_cohort_assignment_rule(current_setting('test.rule_cohort')::uuid,1);
  result:=public.run_cohort_assignment_rule(current_setting('test.rule_cohort')::uuid,1,preview->>'hash',gen_random_uuid());
  IF (result->>'added')::integer<>1 THEN RAISE EXCEPTION 'Explicitly cleared exclusion did not allow matching member'; END IF;
  PERFORM public.set_organization_cohort_member(current_setting('test.rule_cohort')::uuid,current_setting('test.rule_b')::uuid,true);
END;
$manual_exclusion$;
SELECT set_config('request.jwt.claim.sub',current_setting('test.rule_owner'),true);
SELECT public.set_organization_member(current_setting('test.rule_org')::uuid,'rule-a-'||current_setting('test.rule_a')||'@example.invalid','learner',NULL,NULL,'Office analyst',1);
SELECT public.set_organization_member(current_setting('test.rule_org')::uuid,'rule-b-'||current_setting('test.rule_b')||'@example.invalid','learner',NULL,NULL,'Office analyst',1);
SELECT set_config('request.jwt.claim.sub',current_setting('test.rule_manager'),true);
DO $sync_owned_only$
DECLARE preview jsonb; result jsonb;
BEGIN
  preview:=public.preview_cohort_assignment_rule(current_setting('test.rule_cohort')::uuid,1);
  IF (preview->>'remove')::integer<>1 THEN RAISE EXCEPTION 'Sync would remove an adopted or pre-existing manual member'; END IF;
  result:=public.run_cohort_assignment_rule(current_setting('test.rule_cohort')::uuid,1,preview->>'hash',gen_random_uuid());
  IF (result->>'removed')::integer<>1 OR (SELECT count(*) FROM public.organization_cohort_people(current_setting('test.rule_cohort')::uuid))<>2 THEN RAISE EXCEPTION 'Rule-only removal failed'; END IF;
  IF EXISTS(SELECT 1 FROM public.cohort_rule_exclusions WHERE rule_id=current_setting('test.rule_id')::uuid AND user_id=current_setting('test.rule_a')::uuid) THEN RAISE EXCEPTION 'Automatic removal created a permanent manual exclusion'; END IF;
  PERFORM public.save_cohort_assignment_rule(current_setting('test.rule_cohort')::uuid,NULL,false,NULL,'learner',true,false,15,1);
  preview:=public.preview_cohort_assignment_rule(current_setting('test.rule_cohort')::uuid,2); PERFORM set_config('test.rule_stale_preview',preview::text,true);
END;
$sync_owned_only$;
SELECT set_config('request.jwt.claim.sub',current_setting('test.rule_owner'),true);
SELECT public.set_organization_member(current_setting('test.rule_org')::uuid,'rule-a-'||current_setting('test.rule_a')||'@example.invalid','manager',NULL,NULL,'Role changed after preview',2);
SELECT set_config('request.jwt.claim.sub',current_setting('test.rule_manager'),true);
DO $stale_preview$
DECLARE denied boolean:=false; preview jsonb;
BEGIN
  BEGIN PERFORM public.run_cohort_assignment_rule(current_setting('test.rule_cohort')::uuid,2,current_setting('test.rule_stale_preview')::jsonb->>'hash',gen_random_uuid()); EXCEPTION WHEN raise_exception THEN denied:=SQLERRM LIKE 'The matching roster changed%'; END;
  IF NOT denied THEN RAISE EXCEPTION 'Stale matching roster was applied without renewed confirmation'; END IF;
  PERFORM public.save_cohort_assignment_rule(current_setting('test.rule_cohort')::uuid,NULL,false,NULL,'all',true,false,15,2);
  preview:=public.preview_cohort_assignment_rule(current_setting('test.rule_cohort')::uuid,3);
  PERFORM public.set_cohort_assignment_schedule(current_setting('test.rule_cohort')::uuid,3,true,preview->>'hash');
  PERFORM public.save_organization_cohort(current_setting('test.rule_cohort')::uuid,'Rule-managed training',2,false,0);
END;
$stale_preview$;
RESET ROLE;
UPDATE public.cohort_assignment_rules SET next_run=clock_timestamp()-interval '1 minute' WHERE id=current_setting('test.rule_id')::uuid;
SET LOCAL ROLE service_role;
DO $capacity_atomic$
DECLARE result jsonb;
BEGIN
  result:=public.run_due_organization_assignment_rules(current_setting('test.rule_org')::uuid,10);
  IF (result->>'failed')::integer<>1 OR (SELECT count(*) FROM public.cohort_members WHERE cohort_id=current_setting('test.rule_cohort')::uuid)<>2 THEN RAISE EXCEPTION 'Scheduled capacity failure left partial membership'; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.cohort_assignment_rules WHERE id=current_setting('test.rule_id')::uuid AND last_status='capacity_exceeded') THEN RAISE EXCEPTION 'Rule capacity failure not visible'; END IF;
END;
$capacity_atomic$;
RESET ROLE;
SELECT set_config('request.jwt.claim.sub',current_setting('test.rule_manager'),true);
SELECT public.save_organization_cohort(current_setting('test.rule_cohort')::uuid,'Rule-managed training',10,false,1);
UPDATE public.cohort_assignment_rules SET next_run=clock_timestamp()-interval '1 minute' WHERE id=current_setting('test.rule_id')::uuid;
SET LOCAL ROLE service_role;
DO $scheduled_success$
DECLARE result jsonb;
BEGIN
  result:=public.run_due_organization_assignment_rules(current_setting('test.rule_org')::uuid,10);
  IF (result->>'applied')::integer<>1 THEN RAISE EXCEPTION 'Due enabled rule did not run'; END IF;
  IF (SELECT count(*) FROM public.cohort_members WHERE cohort_id=current_setting('test.rule_cohort')::uuid)<>5 THEN RAISE EXCEPTION 'Scheduled rule did not restore eligible automatically removed members'; END IF;
  result:=public.run_due_organization_assignment_rules(current_setting('test.rule_org')::uuid,10);
  IF (result->>'applied')::integer<>0 THEN RAISE EXCEPTION 'Scheduled rule reran before its interval'; END IF;
  IF EXISTS(SELECT 1 FROM public.cohort_rule_operation_markers WHERE transaction_id=txid_current()) THEN RAISE EXCEPTION 'Internal rule markers survived completion'; END IF;
END;
$scheduled_success$;
RESET ROLE;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub',current_setting('test.rule_outsider'),true);
DO $outsider$
DECLARE denied boolean:=false;
BEGIN
  IF EXISTS(SELECT 1 FROM public.cohort_assignment_rules WHERE id=current_setting('test.rule_id')::uuid) OR EXISTS(SELECT 1 FROM public.cohort_rule_excluded_people(current_setting('test.rule_cohort')::uuid)) THEN RAISE EXCEPTION 'Other tenant reads rule data'; END IF;
  BEGIN PERFORM public.preview_cohort_assignment_rule(current_setting('test.rule_cohort')::uuid,3); EXCEPTION WHEN raise_exception THEN denied:=true; END;
  IF NOT denied THEN RAISE EXCEPTION 'Other tenant previews membership changes'; END IF;
  IF has_function_privilege('authenticated','public.run_due_organization_assignment_rules(uuid,integer)','EXECUTE') OR has_table_privilege('authenticated','public.cohort_rule_operation_markers','INSERT') THEN RAISE EXCEPTION 'Private scheduler or operation markers exposed'; END IF;
END;
$outsider$;
RESET ROLE;
ROLLBACK;
