BEGIN;
DO $fixture$
DECLARE owner_ref uuid; learner_ref uuid:=gen_random_uuid(); outsider_ref uuid:=gen_random_uuid(); org_a uuid:=gen_random_uuid(); org_b uuid:=gen_random_uuid(); course_a uuid; course_b uuid; course_shared uuid; course_unassigned uuid; cohort_ref uuid;
BEGIN
  SELECT user_id INTO owner_ref FROM public.user_roles WHERE role='admin' LIMIT 1;
  INSERT INTO auth.users(id,aud,role,email,created_at,updated_at) VALUES(learner_ref,'authenticated','authenticated','portal-member-'||learner_ref||'@example.invalid',now(),now()),(outsider_ref,'authenticated','authenticated','portal-outsider-'||outsider_ref||'@example.invalid',now(),now());
  PERFORM set_config('request.jwt.claim.sub',owner_ref::text,true);
  PERFORM public.save_organization(org_a,'Portal company A','Private welcome never public','#123456',NULL,0);
  PERFORM public.save_organization(org_b,'Portal company B','Other private welcome','#654321',NULL,0);
  PERFORM public.set_organization_member(org_a,'portal-member-'||learner_ref||'@example.invalid','learner',NULL,NULL,'Learner',0);
  PERFORM public.set_organization_member(org_b,'portal-member-'||learner_ref||'@example.invalid','learner',NULL,NULL,'Learner',0);
  PERFORM public.save_organization_portal(org_a,'fixture-'||org_a,true,'Public welcome',0);
  PERFORM public.save_organization_portal(org_b,'fixture-'||org_b,false,'Hidden portal',0);
  INSERT INTO public.studio_courses(author_id,title,description,price_cents) VALUES(owner_ref,'Portal paid A','Paid private training for portal members only',2000) RETURNING id INTO course_a;
  INSERT INTO public.studio_courses(author_id,title,description) VALUES(owner_ref,'Portal private B','Different tenant training for another company') RETURNING id INTO course_b;
  INSERT INTO public.studio_courses(author_id,title,description) VALUES(owner_ref,'Portal assigned shared','Shared training assigned inside portal') RETURNING id INTO course_shared;
  INSERT INTO public.studio_courses(author_id,title,description) VALUES(owner_ref,'Portal unrelated public','Public but not in portal inventory') RETURNING id INTO course_unassigned;
  INSERT INTO public.studio_lessons(course_id,title,kind,body,position) SELECT id,'Reading','reading','Synthetic portal training',0 FROM public.studio_courses WHERE id IN(course_a,course_b,course_shared,course_unassigned);
  PERFORM public.set_course_organization(course_a,org_a,NULL); PERFORM public.set_course_organization(course_b,org_b,NULL);
  PERFORM public.studio_approve_review(course_a); PERFORM public.studio_publish_version(course_a,'Portal fixture');
  PERFORM public.studio_approve_review(course_b); PERFORM public.studio_publish_version(course_b,'Portal fixture');
  PERFORM public.studio_approve_review(course_shared); PERFORM public.studio_publish_version(course_shared,'Portal fixture');
  PERFORM public.studio_approve_review(course_unassigned); PERFORM public.studio_publish_version(course_unassigned,'Portal fixture');
  INSERT INTO public.cohorts(name,owner_id) VALUES('Portal fixture cohort',owner_ref) RETURNING id INTO cohort_ref;
  INSERT INTO public.cohort_members(cohort_id,user_id) VALUES(cohort_ref,learner_ref);
  PERFORM public.bind_organization_cohort(cohort_ref,org_a,NULL);
  INSERT INTO public.cohort_course_assignments(cohort_id,course_id) VALUES(cohort_ref,course_shared);
  PERFORM set_config('test.portal_owner',owner_ref::text,true); PERFORM set_config('test.portal_member',learner_ref::text,true); PERFORM set_config('test.portal_outsider',outsider_ref::text,true);
  PERFORM set_config('test.portal_org',org_a::text,true); PERFORM set_config('test.portal_other_org',org_b::text,true); PERFORM set_config('test.portal_course',course_a::text,true); PERFORM set_config('test.portal_other_course',course_b::text,true); PERFORM set_config('test.portal_shared_course',course_shared::text,true);
END;
$fixture$;
SET LOCAL ROLE anon;
SELECT set_config('request.jwt.claim.sub','',true);
DO $anonymous$
DECLARE portal jsonb;
BEGIN
  portal:=public.organization_portal('fixture-'||current_setting('test.portal_org'));
  IF portal->>'message'<>'Public welcome' OR portal->'brand'->>'name'<>'Portal company A' OR (SELECT count(*) FROM jsonb_object_keys(portal))<>3 OR (SELECT count(*) FROM jsonb_object_keys(portal->'brand'))<>5 THEN RAISE EXCEPTION 'Published portal missing or excessive fields disclosed'; END IF;
  IF public.organization_portal('fixture-'||current_setting('test.portal_other_org')) IS NOT NULL THEN RAISE EXCEPTION 'Disabled portal is public'; END IF;
  IF has_function_privilege('anon','public.portal_course_report(text,boolean,text,integer,integer)','EXECUTE') OR has_function_privilege('authenticated','public.portal_course_inventory(uuid)','EXECUTE') OR has_table_privilege('authenticated','public.organization_portals','UPDATE') THEN RAISE EXCEPTION 'Private portal operations exposed'; END IF;
END;
$anonymous$;
RESET ROLE;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub',current_setting('test.portal_member'),true);
DO $member$
DECLARE report jsonb; denied boolean:=false;
BEGIN
  report:=public.portal_course_report('fixture-'||current_setting('test.portal_org'),false);
  IF (report->>'total')::integer<>2 OR report->>'can_manage'<>'false' OR EXISTS(SELECT 1 FROM jsonb_array_elements(report->'records') item WHERE item->>'id'=current_setting('test.portal_other_course')) THEN RAISE EXCEPTION 'Portal inventory crossed tenant boundary or omitted assignments'; END IF;
  report:=public.portal_course_report('fixture-'||current_setting('test.portal_org'),true);
  IF (report->>'total')::integer<>1 OR report->'records'->0->>'id'<>current_setting('test.portal_shared_course') OR report->'records'->0->>'assigned'<>'true' THEN RAISE EXCEPTION 'My Learning includes unassigned unstarted courses'; END IF;
  IF public.studio_course_visible(current_setting('test.portal_course')::uuid) OR EXISTS(SELECT 1 FROM public.studio_lessons WHERE course_id=current_setting('test.portal_course')::uuid) THEN RAISE EXCEPTION 'Portal bypassed paid access'; END IF;
  IF public.portal_learning_brand('fixture-'||current_setting('test.portal_org'),current_setting('test.portal_course')::uuid)->>'name'<>'Portal company A' OR public.portal_learning_brand('fixture-'||current_setting('test.portal_org'),current_setting('test.portal_other_course')::uuid) IS NOT NULL THEN RAISE EXCEPTION 'Course branding crossed portal boundary'; END IF;
  IF EXISTS(SELECT 1 FROM public.organization_portals) THEN RAISE EXCEPTION 'Learner reads private portal configuration'; END IF;
  BEGIN PERFORM public.save_organization_portal(current_setting('test.portal_org')::uuid,'fixture-'||current_setting('test.portal_org'),false,'Changed',1); EXCEPTION WHEN raise_exception THEN denied:=true; END;
  IF NOT denied THEN RAISE EXCEPTION 'Learner changed portal configuration'; END IF;
  report:=public.portal_course_report('fixture-'||current_setting('test.portal_org'),false,'nonexistent',0,1);
  IF report->>'total'<>'0' OR jsonb_array_length(report->'records')<>0 THEN RAISE EXCEPTION 'Portal search did not filter'; END IF;
END;
$member$;
SELECT set_config('request.jwt.claim.sub',current_setting('test.portal_outsider'),true);
DO $outsider$
DECLARE denied boolean:=false;
BEGIN
  PERFORM public.organization_portal('fixture-'||current_setting('test.portal_org'));
  IF public.organization_access(current_setting('test.portal_org')::uuid) OR public.portal_learning_brand('fixture-'||current_setting('test.portal_org'),NULL) IS NOT NULL THEN RAISE EXCEPTION 'Public portal lookup joined organization'; END IF;
  BEGIN PERFORM public.portal_course_report('fixture-'||current_setting('test.portal_org')); EXCEPTION WHEN raise_exception THEN denied:=true; END;
  IF NOT denied THEN RAISE EXCEPTION 'Nonmember read portal training'; END IF;
END;
$outsider$;
SELECT set_config('request.jwt.claim.sub',current_setting('test.portal_owner'),true);
DO $manager$
DECLARE denied boolean:=false;
BEGIN
  BEGIN PERFORM public.save_organization_portal(current_setting('test.portal_org')::uuid,'fixture-'||current_setting('test.portal_org'),true,'Changed',0); EXCEPTION WHEN raise_exception THEN denied:=true; END;
  IF NOT denied THEN RAISE EXCEPTION 'Stale portal update accepted'; END IF;
  denied:=false;
  BEGIN PERFORM public.save_organization_portal(current_setting('test.portal_org')::uuid,'changed-address',true,'Changed',1); EXCEPTION WHEN raise_exception THEN denied:=true; END;
  IF NOT denied THEN RAISE EXCEPTION 'Permanent address changed'; END IF;
  denied:=false;
  BEGIN PERFORM public.save_organization_portal(current_setting('test.portal_other_org')::uuid,'fixture-'||current_setting('test.portal_org'),true,'Changed',1); EXCEPTION WHEN raise_exception THEN denied:=true; END;
  IF NOT denied THEN RAISE EXCEPTION 'Another organization took reserved portal address'; END IF;
  PERFORM public.save_organization_portal(current_setting('test.portal_org')::uuid,'fixture-'||current_setting('test.portal_org'),false,'Disabled',1);
  IF public.organization_portal('fixture-'||current_setting('test.portal_org')) IS NOT NULL THEN RAISE EXCEPTION 'Disabling portal left branding published'; END IF;
END;
$manager$;
RESET ROLE;
ROLLBACK;
