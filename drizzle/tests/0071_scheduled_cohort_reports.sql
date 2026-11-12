BEGIN;
DO $fixture$
DECLARE owner_ref uuid; manager_ref uuid:=gen_random_uuid(); learner_ref uuid:=gen_random_uuid(); outsider_ref uuid:=gen_random_uuid(); org_ref uuid:=gen_random_uuid(); other_org uuid:=gen_random_uuid(); cohort_ref uuid:=gen_random_uuid(); course_ref uuid;
BEGIN
  SELECT user_id INTO owner_ref FROM public.user_roles WHERE role='admin' LIMIT 1;
  INSERT INTO auth.users(id,aud,role,email,created_at,updated_at) VALUES(manager_ref,'authenticated','authenticated','report-manager-'||manager_ref||'@example.invalid',now(),now()),(learner_ref,'authenticated','authenticated','report-learner-'||learner_ref||'@example.invalid',now(),now()),(outsider_ref,'authenticated','authenticated','report-outsider-'||outsider_ref||'@example.invalid',now(),now());
  PERFORM set_config('request.jwt.claim.sub',owner_ref::text,true);
  PERFORM public.save_organization(org_ref,'Scheduled report company','','#123456',NULL,0); PERFORM public.save_organization(other_org,'Other report company','','#654321',NULL,0);
  PERFORM public.set_organization_member(org_ref,'report-manager-'||manager_ref||'@example.invalid','manager',NULL,NULL,'Trainer',0);
  PERFORM public.set_organization_member(org_ref,'report-learner-'||learner_ref||'@example.invalid','learner',NULL,NULL,'Learner',0);
  PERFORM public.set_organization_member(other_org,'report-outsider-'||outsider_ref||'@example.invalid','manager',NULL,NULL,'Other manager',0);
  INSERT INTO public.studio_courses(author_id,title,description) VALUES(owner_ref,'Scheduled private training','Organization scheduled report integration fixture') RETURNING id INTO course_ref;
  INSERT INTO public.studio_lessons(course_id,title,kind,body,position) VALUES(course_ref,'Read','reading','Private training material',0);
  PERFORM public.set_course_organization(course_ref,org_ref,NULL); PERFORM public.studio_approve_review(course_ref); PERFORM public.studio_publish_version(course_ref,'Scheduled report fixture');
  PERFORM public.create_organization_cohort(org_ref,cohort_ref,'Report-managed training'); PERFORM public.set_organization_cohort_member(cohort_ref,learner_ref,true); PERFORM public.set_organization_cohort_course(cohort_ref,course_ref,true,NULL);
  PERFORM set_config('test.report_owner',owner_ref::text,true); PERFORM set_config('test.report_manager',manager_ref::text,true); PERFORM set_config('test.report_learner',learner_ref::text,true); PERFORM set_config('test.report_outsider',outsider_ref::text,true);
  PERFORM set_config('test.report_org',org_ref::text,true); PERFORM set_config('test.report_other_org',other_org::text,true); PERFORM set_config('test.report_cohort',cohort_ref::text,true); PERFORM set_config('test.report_course',course_ref::text,true);
END;
$fixture$;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub',current_setting('test.report_manager'),true);
DO $manual$
DECLARE report_ref uuid:=gen_random_uuid(); report jsonb; denied boolean:=false;
BEGIN
  IF public.save_cohort_report_schedule(current_setting('test.report_cohort')::uuid,false,1440,0)<>1 THEN RAISE EXCEPTION 'Schedule version incorrect'; END IF;
  PERFORM public.generate_cohort_report_snapshot(current_setting('test.report_cohort')::uuid,report_ref);
  IF public.generate_cohort_report_snapshot(current_setting('test.report_cohort')::uuid,report_ref)<>report_ref OR (SELECT count(*) FROM public.company_cohort_report_history(current_setting('test.report_cohort')::uuid))<>1 THEN RAISE EXCEPTION 'Manual report retry duplicated'; END IF;
  report:=public.company_cohort_report_snapshot(report_ref);
  IF (report->>'total')::integer<>1 OR report#>>'{records,0,course_title}'<>'Scheduled private training' OR (report#>>'{records,0,total_lessons}')::integer<>1 THEN RAISE EXCEPTION 'Snapshot content incomplete'; END IF;
  PERFORM set_config('test.report_snapshot',report_ref::text,true);
  BEGIN PERFORM public.save_cohort_report_schedule(current_setting('test.report_cohort')::uuid,true,1440,0); EXCEPTION WHEN raise_exception THEN denied:=true; END;
  IF NOT denied THEN RAISE EXCEPTION 'Stale schedule overwrite accepted'; END IF;
  PERFORM public.save_cohort_report_schedule(current_setting('test.report_cohort')::uuid,true,60,1);
END;
$manual$;
RESET ROLE;
UPDATE public.cohort_report_schedules SET next_run=clock_timestamp()-interval '1 minute' WHERE cohort_id=current_setting('test.report_cohort')::uuid;
SET LOCAL ROLE service_role;
DO $scheduled$
DECLARE result jsonb;
BEGIN
  result:=public.run_due_company_cohort_reports(current_setting('test.report_org')::uuid,10);
  IF (result->>'generated')::integer<>1 OR (result->>'failed')::integer<>0 THEN RAISE EXCEPTION 'Due report not generated'; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.cohort_report_snapshots WHERE cohort_id=current_setting('test.report_cohort')::uuid AND scheduled AND actor_id IS NULL AND schedule_version=2) THEN RAISE EXCEPTION 'Scheduled report attribution incorrect'; END IF;
  result:=public.run_due_company_cohort_reports(current_setting('test.report_org')::uuid,10);
  IF (result->>'generated')::integer<>0 THEN RAISE EXCEPTION 'Scheduled report regenerated before interval'; END IF;
END;
$scheduled$;
RESET ROLE;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub',current_setting('test.report_outsider'),true);
DO $outsider$
DECLARE denied boolean:=false;
BEGIN
  IF public.company_report_scheduler_status(current_setting('test.report_org')::uuid) IS NOT NULL OR public.company_cohort_report_snapshot(current_setting('test.report_snapshot')::uuid) IS NOT NULL OR EXISTS(SELECT 1 FROM public.company_cohort_report_history(current_setting('test.report_cohort')::uuid)) OR EXISTS(SELECT 1 FROM public.cohort_report_schedules WHERE cohort_id=current_setting('test.report_cohort')::uuid) THEN RAISE EXCEPTION 'Cross-company report exposed'; END IF;
  BEGIN PERFORM public.generate_cohort_report_snapshot(current_setting('test.report_cohort')::uuid,gen_random_uuid()); EXCEPTION WHEN raise_exception THEN denied:=true; END;
  IF NOT denied OR has_function_privilege('authenticated','public.build_company_cohort_report(uuid)','EXECUTE') OR has_function_privilege('authenticated','public.run_due_company_cohort_reports(uuid,integer)','EXECUTE') OR has_table_privilege('authenticated','public.cohort_report_snapshots','SELECT') THEN RAISE EXCEPTION 'Private report generation or storage exposed'; END IF;
END;
$outsider$;
SELECT set_config('request.jwt.claim.sub',current_setting('test.report_learner'),true);
DO $learner$
BEGIN
  IF public.company_cohort_report_snapshot(current_setting('test.report_snapshot')::uuid) IS NOT NULL THEN RAISE EXCEPTION 'Learner can read managerial history'; END IF;
END;
$learner$;
RESET ROLE;
SELECT set_config('request.jwt.claim.sub',current_setting('test.report_owner'),true);
SELECT public.set_organization_member(current_setting('test.report_org')::uuid,'report-manager-'||current_setting('test.report_manager')||'@example.invalid','learner',NULL,NULL,'Former manager',1);
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub',current_setting('test.report_manager'),true);
DO $demoted$
BEGIN
  IF public.company_cohort_report_snapshot(current_setting('test.report_snapshot')::uuid) IS NOT NULL OR EXISTS(SELECT 1 FROM public.cohort_report_schedules WHERE cohort_id=current_setting('test.report_cohort')::uuid) THEN RAISE EXCEPTION 'Demoted creator retains report access'; END IF;
END;
$demoted$;
RESET ROLE;
DO $redaction_retention$
DECLARE result jsonb; counter integer;
BEGIN
  PERFORM set_config('request.jwt.claim.sub',current_setting('test.report_owner'),true);
  UPDATE public.studio_courses SET published=false WHERE id=current_setting('test.report_course')::uuid;
  result:=public.build_company_cohort_report(current_setting('test.report_cohort')::uuid);
  IF result#>>'{records,0,course_title}'<>'Course unavailable' OR (result#>>'{records,0,total_lessons}')::integer<>0 OR (result#>>'{records,0,payment_access}')::boolean THEN RAISE EXCEPTION 'Unpublished course details leaked in new snapshot'; END IF;
  FOR counter IN 1..31 LOOP PERFORM public.generate_cohort_report_snapshot(current_setting('test.report_cohort')::uuid,gen_random_uuid()); END LOOP;
  IF (SELECT count(*) FROM public.cohort_report_snapshots WHERE cohort_id=current_setting('test.report_cohort')::uuid)<>30 THEN RAISE EXCEPTION 'Snapshot count retention failed'; END IF;
  UPDATE public.cohort_report_snapshots SET created_at=clock_timestamp()-interval '31 days' WHERE cohort_id=current_setting('test.report_cohort')::uuid;
  IF EXISTS(SELECT 1 FROM public.company_cohort_report_history(current_setting('test.report_cohort')::uuid)) THEN RAISE EXCEPTION 'Expired snapshot still readable'; END IF;
  PERFORM public.run_due_company_cohort_reports(current_setting('test.report_org')::uuid,10);
  IF EXISTS(SELECT 1 FROM public.cohort_report_snapshots WHERE cohort_id=current_setting('test.report_cohort')::uuid) THEN RAISE EXCEPTION 'Expired snapshot storage not cleaned'; END IF;
END;
$redaction_retention$;
ROLLBACK;
