BEGIN;
DO $fixture$
DECLARE owner_ref uuid; manager_ref uuid:=gen_random_uuid(); learner_ref uuid:=gen_random_uuid(); outsider_ref uuid:=gen_random_uuid(); org_ref uuid:=gen_random_uuid(); other_org uuid:=gen_random_uuid(); root_ref uuid:=gen_random_uuid(); child_ref uuid:=gen_random_uuid(); other_dept uuid:=gen_random_uuid(); denied boolean:=false;
BEGIN
  SELECT user_id INTO owner_ref FROM public.user_roles WHERE role='admin' LIMIT 1;
  INSERT INTO auth.users(id,aud,role,email,created_at,updated_at) VALUES(manager_ref,'authenticated','authenticated','org-manager-'||manager_ref||'@example.invalid',now(),now()),(learner_ref,'authenticated','authenticated','org-learner-'||learner_ref||'@example.invalid',now(),now()),(outsider_ref,'authenticated','authenticated','org-outsider-'||outsider_ref||'@example.invalid',now(),now());
  PERFORM set_config('request.jwt.claim.sub',owner_ref::text,true);
  PERFORM public.save_organization(org_ref,'Workspace A','Training for this organization','#2765BC',NULL,0);
  PERFORM public.save_organization(other_org,'Workspace B','Separate customer workspace','#224466',NULL,0);
  PERFORM public.save_organization_department(org_ref,root_ref,'Operations',NULL,0);
  PERFORM public.save_organization_department(org_ref,child_ref,'Field team',root_ref,0);
  PERFORM public.save_organization_department(other_org,other_dept,'Other team',NULL,0);
  BEGIN PERFORM public.save_organization_department(org_ref,root_ref,'Operations',child_ref,1); EXCEPTION WHEN raise_exception THEN denied:=true; END;
  IF NOT denied THEN RAISE EXCEPTION 'Cyclic department hierarchy accepted'; END IF;
  denied:=false;
  BEGIN PERFORM public.save_organization_department(org_ref,child_ref,'Field team',other_dept,1); EXCEPTION WHEN raise_exception THEN denied:=true; END;
  IF NOT denied THEN RAISE EXCEPTION 'Department crossed organization boundary'; END IF;
  PERFORM public.set_organization_member(org_ref,'org-manager-'||manager_ref||'@example.invalid','manager',root_ref,NULL,'Training manager',0);
  PERFORM public.set_organization_member(org_ref,'org-learner-'||learner_ref||'@example.invalid','learner',child_ref,manager_ref,'Field learner',0);
  PERFORM public.set_organization_member(other_org,'org-outsider-'||outsider_ref||'@example.invalid','manager',other_dept,NULL,'Other manager',0);
  PERFORM set_config('test.org_owner',owner_ref::text,true); PERFORM set_config('test.org_manager',manager_ref::text,true); PERFORM set_config('test.org_learner',learner_ref::text,true); PERFORM set_config('test.org_outsider',outsider_ref::text,true);
  PERFORM set_config('test.org_id',org_ref::text,true); PERFORM set_config('test.org_other',other_org::text,true); PERFORM set_config('test.org_root',root_ref::text,true); PERFORM set_config('test.org_child',child_ref::text,true);
  IF has_table_privilege('authenticated','public.organization_members','UPDATE') OR has_table_privilege('authenticated','public.organizations','INSERT') THEN RAISE EXCEPTION 'Organization records directly writable'; END IF;
END;
$fixture$;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub',current_setting('test.org_learner'),true);
DO $learner$
DECLARE denied boolean:=false;
BEGIN
  IF (SELECT count(*) FROM public.my_organizations())<>1 OR EXISTS(SELECT 1 FROM public.organizations WHERE id=current_setting('test.org_other')::uuid) THEN RAISE EXCEPTION 'Learner sees another organization'; END IF;
  IF (SELECT count(*) FROM public.organization_people(current_setting('test.org_id')::uuid))<>1 OR (SELECT count(*) FROM public.organization_members WHERE organization_id=current_setting('test.org_id')::uuid)<>1 THEN RAISE EXCEPTION 'Learner sees full private directory'; END IF;
  BEGIN PERFORM public.set_organization_member(current_setting('test.org_id')::uuid,'org-learner-'||current_setting('test.org_learner')||'@example.invalid','manager',NULL,NULL,'Elevated',1); EXCEPTION WHEN raise_exception THEN denied:=true; END;
  IF NOT denied THEN RAISE EXCEPTION 'Learner promoted themselves'; END IF;
  denied:=false;
  BEGIN PERFORM public.save_organization(gen_random_uuid(),'Unapproved company','','#123456',NULL,0); EXCEPTION WHEN raise_exception THEN denied:=true; END;
  IF NOT denied THEN RAISE EXCEPTION 'Ordinary learner created an organization'; END IF;
END;
$learner$;
SELECT set_config('request.jwt.claim.sub',current_setting('test.org_manager'),true);
DO $manager$
DECLARE denied boolean:=false;
BEGIN
  IF NOT public.organization_manage(current_setting('test.org_id')::uuid) OR (SELECT count(*) FROM public.organization_people(current_setting('test.org_id')::uuid))<>3 THEN RAISE EXCEPTION 'Scoped manager cannot read their directory'; END IF;
  IF EXISTS(SELECT 1 FROM public.organization_people(current_setting('test.org_other')::uuid)) THEN RAISE EXCEPTION 'Manager sees another tenant directory'; END IF;
  PERFORM public.save_organization(current_setting('test.org_id')::uuid,'Workspace A updated','Private welcome','#335577','https://example.com/logo.png',1);
  BEGIN PERFORM public.set_organization_member(current_setting('test.org_id')::uuid,'org-manager-'||current_setting('test.org_manager')||'@example.invalid','manager',NULL,current_setting('test.org_learner')::uuid,'Cycle',1); EXCEPTION WHEN raise_exception THEN denied:=true; END;
  IF NOT denied THEN RAISE EXCEPTION 'Reporting-line cycle accepted'; END IF;
  denied:=false;
  BEGIN PERFORM public.remove_organization_member(current_setting('test.org_id')::uuid,current_setting('test.org_owner')::uuid,1); EXCEPTION WHEN raise_exception THEN denied:=true; END;
  IF NOT denied THEN RAISE EXCEPTION 'Manager removed organization owner'; END IF;
  denied:=false;
  BEGIN PERFORM public.set_organization_member(current_setting('test.org_id')::uuid,'org-learner-'||current_setting('test.org_learner')||'@example.invalid','learner',NULL,current_setting('test.org_outsider')::uuid,'Cross tenant',1); EXCEPTION WHEN raise_exception THEN denied:=true; END;
  IF NOT denied THEN RAISE EXCEPTION 'Cross-tenant reporting manager accepted'; END IF;
END;
$manager$;
SELECT set_config('request.jwt.claim.sub',current_setting('test.org_outsider'),true);
DO $outsider$
DECLARE denied boolean:=false;
BEGIN
  IF EXISTS(SELECT 1 FROM public.organization_departments WHERE organization_id=current_setting('test.org_id')::uuid) OR EXISTS(SELECT 1 FROM public.organization_members WHERE organization_id=current_setting('test.org_id')::uuid) THEN RAISE EXCEPTION 'Other-tenant manager reads tenant data'; END IF;
  BEGIN PERFORM public.save_organization(current_setting('test.org_id')::uuid,'Attacker company','','#ffffff',NULL,2); EXCEPTION WHEN raise_exception THEN denied:=true; END;
  IF NOT denied THEN RAISE EXCEPTION 'Other-tenant manager changed branding'; END IF;
END;
$outsider$;
SELECT set_config('request.jwt.claim.sub',current_setting('test.org_owner'),true);
SELECT public.remove_organization_member(current_setting('test.org_id')::uuid,current_setting('test.org_manager')::uuid,1);
RESET ROLE;
DO $removed$
BEGIN
  IF EXISTS(SELECT 1 FROM public.organization_members WHERE organization_id=current_setting('test.org_id')::uuid AND manager_id=current_setting('test.org_manager')::uuid) THEN RAISE EXCEPTION 'Removed manager remains in reporting lines'; END IF;
  IF public.has_role(current_setting('test.org_manager')::uuid,'admin') THEN RAISE EXCEPTION 'Organization role became a platform administrator'; END IF;
END;
$removed$;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub',current_setting('test.org_manager'),true);
DO $$ BEGIN IF public.organization_access(current_setting('test.org_id')::uuid) OR EXISTS(SELECT 1 FROM public.organizations WHERE id=current_setting('test.org_id')::uuid) THEN RAISE EXCEPTION 'Removed manager retains workspace access'; END IF; END; $$;
RESET ROLE;
SET LOCAL ROLE anon;
DO $$ BEGIN IF has_function_privilege('anon','public.my_organizations()','EXECUTE') THEN RAISE EXCEPTION 'Anonymous organization directory exposed'; END IF; END; $$;
RESET ROLE;
ROLLBACK;
