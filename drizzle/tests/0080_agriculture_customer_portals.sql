BEGIN;
DO $fixture$
DECLARE owner_ref uuid; learner_ref uuid:=gen_random_uuid(); org_ref uuid:=gen_random_uuid(); other_org uuid:=gen_random_uuid(); agri uuid; nonagri uuid; private_agri uuid; other_agri uuid; draft_agri uuid; cohort_ref uuid:=gen_random_uuid(); program_ref uuid:=gen_random_uuid(); version_ref uuid;
BEGIN
  SELECT user_id INTO owner_ref FROM public.user_roles WHERE role='admin' LIMIT 1;
  INSERT INTO auth.users(id,aud,role,email,created_at,updated_at) VALUES(learner_ref,'authenticated','authenticated','agri-portal-'||learner_ref||'@example.invalid',now(),now());
  PERFORM set_config('request.jwt.claim.sub',owner_ref::text,true);
  PERFORM public.save_organization(org_ref,'Agriculture portal fixture','','#123456',NULL,0); PERFORM public.save_organization(other_org,'Private agriculture owner','','#654321',NULL,0);
  PERFORM public.set_organization_member(org_ref,'agri-portal-'||learner_ref||'@example.invalid','learner',NULL,NULL,'Learner',0);
  PERFORM public.save_organization_portal(org_ref,'agri-'||org_ref,true,'Agriculture training only',0,true);
  INSERT INTO public.studio_courses(author_id,title,description,category,price_cents) VALUES(owner_ref,'Agri fixture public','Published public agriculture training for scope checks','Agriculture / Beekeeping',2500) RETURNING id INTO agri;
  INSERT INTO public.studio_courses(author_id,title,description,category) VALUES(owner_ref,'Agri fixture excluded','Published healthcare course must never appear in agriculture portal','Healthcare / Nursing') RETURNING id INTO nonagri;
  INSERT INTO public.studio_courses(author_id,title,description,category) VALUES(owner_ref,'Agri fixture private','Private agriculture training for organization members','Crop Farming') RETURNING id INTO private_agri;
  INSERT INTO public.studio_courses(author_id,title,description,category) VALUES(owner_ref,'Agri fixture foreign','Another company agriculture course must remain private','Livestock') RETURNING id INTO other_agri;
  INSERT INTO public.studio_courses(author_id,title,description,category) VALUES(owner_ref,'Agri fixture draft','Draft agriculture course must never appear in portal','Horticulture') RETURNING id INTO draft_agri;
  INSERT INTO public.studio_lessons(course_id,title,kind,body,position) SELECT id,'Read','reading','Private lesson body must not enter the external catalogue',0 FROM public.studio_courses WHERE id IN(agri,nonagri,private_agri,other_agri,draft_agri);
  PERFORM public.set_course_organization(private_agri,org_ref,NULL); PERFORM public.set_course_organization(other_agri,other_org,NULL);
  PERFORM public.studio_approve_review(agri); PERFORM public.studio_publish_version(agri,'Agriculture fixture');
  PERFORM public.studio_approve_review(nonagri); PERFORM public.studio_publish_version(nonagri,'Agriculture fixture');
  PERFORM public.studio_approve_review(private_agri); PERFORM public.studio_publish_version(private_agri,'Agriculture fixture');
  PERFORM public.studio_approve_review(other_agri); PERFORM public.studio_publish_version(other_agri,'Agriculture fixture');
  PERFORM public.create_organization_cohort(org_ref,cohort_ref,'Agriculture fixture cohort'); PERFORM public.set_organization_cohort_member(cohort_ref,learner_ref,true);
  INSERT INTO public.cohort_course_assignments(cohort_id,course_id) VALUES(cohort_ref,nonagri);
  PERFORM public.save_organization_program(org_ref,program_ref,'Mixed industry fixture','Must be unavailable in an agriculture-only portal',jsonb_build_array(jsonb_build_object('title','Mixed stage','required',1,'course_ids',jsonb_build_array(agri,nonagri))),0);
  version_ref:=public.publish_learning_program(program_ref,1); PERFORM public.assign_organization_program(cohort_ref,version_ref,NULL,true,0);
  IF NOT public.is_agriculture_category(' Sustainable and Climate-Smart Agriculture ') OR NOT public.is_agriculture_category('Agriculture / Beekeeping') OR public.is_agriculture_category('Healthcare / Agriculture') OR public.is_agriculture_category('Other / Bee Business') OR public.is_agriculture_category(NULL) THEN RAISE EXCEPTION 'Agriculture classification failed closed-category checks'; END IF;
  PERFORM set_config('test.agri_owner',owner_ref::text,true); PERFORM set_config('test.agri_member',learner_ref::text,true); PERFORM set_config('test.agri_org',org_ref::text,true); PERFORM set_config('test.agri_public',agri::text,true); PERFORM set_config('test.agri_excluded',nonagri::text,true); PERFORM set_config('test.agri_private',private_agri::text,true); PERFORM set_config('test.agri_foreign',other_agri::text,true); PERFORM set_config('test.agri_draft',draft_agri::text,true); PERFORM set_config('test.agri_program',version_ref::text,true);
END;
$fixture$;
SET LOCAL ROLE anon;
SELECT set_config('request.jwt.claim.sub','',true);
DO $public$
DECLARE catalogue jsonb;
BEGIN
  catalogue:=public.public_portal_courses('agri-'||current_setting('test.agri_org'),'Agri fixture');
  IF catalogue->>'total'<>'1' OR catalogue->'records'->0->>'id'<>current_setting('test.agri_public') OR catalogue->'records'->0 ? 'body' OR catalogue->'records'->0 ? 'quiz' OR catalogue->'records'->0 ? 'author_id' THEN RAISE EXCEPTION 'External catalogue exposed private, draft, unrelated or lesson data'; END IF;
  IF public.public_portal_courses('not-a-published-portal') IS NOT NULL THEN RAISE EXCEPTION 'Missing portal returned live catalogue'; END IF;
END;
$public$;
RESET ROLE;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub',current_setting('test.agri_member'),true);
DO $member$
DECLARE report jsonb; denied boolean:=false;
BEGIN
  report:=public.portal_course_report('agri-'||current_setting('test.agri_org'),false,'Agri fixture');
  IF report->>'total'<>'2' OR EXISTS(SELECT 1 FROM jsonb_array_elements(report->'records') item WHERE item->>'id' IN(current_setting('test.agri_excluded'),current_setting('test.agri_foreign'),current_setting('test.agri_draft'))) THEN RAISE EXCEPTION 'Assigned non-agriculture, foreign or draft course bypassed portal restriction'; END IF;
  IF public.portal_learning_brand('agri-'||current_setting('test.agri_org'),current_setting('test.agri_excluded')::uuid) IS NOT NULL THEN RAISE EXCEPTION 'Excluded deep link received customer branding'; END IF;
  IF public.studio_course_visible(current_setting('test.agri_public')::uuid) THEN RAISE EXCEPTION 'Agriculture metadata unlocked unpaid course'; END IF;
  IF public.portal_program_progress('agri-'||current_setting('test.agri_org'),current_setting('test.agri_program')::uuid) IS NOT NULL THEN RAISE EXCEPTION 'Mixed-industry program exposed other training'; END IF;
  BEGIN PERFORM public.claim_portal_program_award('agri-'||current_setting('test.agri_org'),current_setting('test.agri_program')::uuid); EXCEPTION WHEN raise_exception THEN denied:=true; END;
  IF NOT denied THEN RAISE EXCEPTION 'Mixed program award bypassed agriculture boundary'; END IF;
  denied:=false; BEGIN PERFORM public.save_organization_portal(current_setting('test.agri_org')::uuid,'agri-'||current_setting('test.agri_org'),true,'Changed',1,false); EXCEPTION WHEN raise_exception THEN denied:=true; END;
  IF NOT denied THEN RAISE EXCEPTION 'Learner changed portal training scope'; END IF;
END;
$member$;
RESET ROLE;
SELECT set_config('request.jwt.claim.sub',current_setting('test.agri_owner'),true);
SELECT public.save_organization_portal(current_setting('test.agri_org')::uuid,'agri-'||current_setting('test.agri_org'),false,'Disabled',1,true);
SET LOCAL ROLE anon;
SELECT set_config('request.jwt.claim.sub','',true);
DO $disabled$ BEGIN IF public.public_portal_courses('agri-'||current_setting('test.agri_org')) IS NOT NULL THEN RAISE EXCEPTION 'Disabled portal external catalogue remained published'; END IF; END; $disabled$;
RESET ROLE;
ROLLBACK;
