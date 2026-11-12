BEGIN;
DO $fixture$
DECLARE owner_ref uuid; learner_ref uuid:=gen_random_uuid(); outsider_ref uuid:=gen_random_uuid(); org_a uuid:=gen_random_uuid(); org_b uuid:=gen_random_uuid(); cohort_a uuid:=gen_random_uuid(); cohort_b uuid:=gen_random_uuid(); course_a uuid; course_b uuid; program_a uuid:=gen_random_uuid(); program_b uuid:=gen_random_uuid(); version_a uuid; version_b uuid;
BEGIN
  SELECT user_id INTO owner_ref FROM public.user_roles WHERE role='admin' LIMIT 1;
  INSERT INTO auth.users(id,aud,role,email,created_at,updated_at) VALUES(learner_ref,'authenticated','authenticated','portal-program-'||learner_ref||'@example.invalid',now(),now()),(outsider_ref,'authenticated','authenticated','portal-program-outsider-'||outsider_ref||'@example.invalid',now(),now());
  PERFORM set_config('request.jwt.claim.sub',owner_ref::text,true);
  PERFORM public.save_organization(org_a,'Portal program company A','','#123456',NULL,0); PERFORM public.save_organization(org_b,'Portal program company B','','#654321',NULL,0);
  PERFORM public.set_organization_member(org_a,'portal-program-'||learner_ref||'@example.invalid','learner',NULL,NULL,'Learner',0);
  PERFORM public.set_organization_member(org_b,'portal-program-'||learner_ref||'@example.invalid','learner',NULL,NULL,'Learner',0);
  PERFORM public.save_organization_portal(org_a,'programs-'||org_a,true,'Programs',0); PERFORM public.save_organization_portal(org_b,'programs-'||org_b,true,'Programs',0);
  INSERT INTO public.studio_courses(author_id,title,description) VALUES(owner_ref,'Program portal A','Synthetic company training for portal program checks') RETURNING id INTO course_a;
  INSERT INTO public.studio_courses(author_id,title,description) VALUES(owner_ref,'Program portal B','Synthetic other company training for portal program checks') RETURNING id INTO course_b;
  INSERT INTO public.studio_lessons(course_id,title,kind,body,position) SELECT id,'Read','reading','Synthetic program training',0 FROM public.studio_courses WHERE id IN(course_a,course_b);
  PERFORM public.set_course_organization(course_a,org_a,NULL); PERFORM public.set_course_organization(course_b,org_b,NULL);
  PERFORM public.studio_approve_review(course_a); PERFORM public.studio_publish_version(course_a,'Portal program fixture'); PERFORM public.studio_approve_review(course_b); PERFORM public.studio_publish_version(course_b,'Portal program fixture');
  PERFORM public.create_organization_cohort(org_a,cohort_a,'Program portal cohort A'); PERFORM public.create_organization_cohort(org_b,cohort_b,'Program portal cohort B');
  PERFORM public.set_organization_cohort_member(cohort_a,learner_ref,true); PERFORM public.set_organization_cohort_member(cohort_b,learner_ref,true);
  PERFORM public.save_organization_program(org_a,program_a,'Portal program A','Tenant A program',jsonb_build_array(jsonb_build_object('title','Foundation','required',1,'course_ids',jsonb_build_array(course_a))),0);
  PERFORM public.save_organization_program(org_b,program_b,'Portal program B','Tenant B program',jsonb_build_array(jsonb_build_object('title','Foundation','required',1,'course_ids',jsonb_build_array(course_b))),0);
  version_a:=public.publish_learning_program(program_a,1); version_b:=public.publish_learning_program(program_b,1);
  PERFORM public.assign_organization_program(cohort_a,version_a,NULL,true,0); PERFORM public.assign_organization_program(cohort_b,version_b,NULL,true,0);
  PERFORM set_config('test.pp_owner',owner_ref::text,true); PERFORM set_config('test.pp_learner',learner_ref::text,true); PERFORM set_config('test.pp_outsider',outsider_ref::text,true); PERFORM set_config('test.pp_org',org_a::text,true); PERFORM set_config('test.pp_other_org',org_b::text,true); PERFORM set_config('test.pp_version',version_a::text,true); PERFORM set_config('test.pp_other_version',version_b::text,true); PERFORM set_config('test.pp_course',course_a::text,true);
END;
$fixture$;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub',current_setting('test.pp_learner'),true);
DO $learner$
DECLARE result jsonb; denied boolean:=false;
BEGIN
  result:=public.portal_learning_programs('programs-'||current_setting('test.pp_org'));
  IF result->>'total'<>'1' OR result->'records'->0->>'id'<>current_setting('test.pp_version') THEN RAISE EXCEPTION 'Programs combined assignments across tenants'; END IF;
  result:=public.portal_program_progress('programs-'||current_setting('test.pp_org'),current_setting('test.pp_version')::uuid);
  IF result->>'title'<>'Portal program A' OR result->>'complete'<>'false' THEN RAISE EXCEPTION 'Scoped program progress incorrect'; END IF;
  IF public.portal_program_progress('programs-'||current_setting('test.pp_org'),current_setting('test.pp_other_version')::uuid) IS NOT NULL THEN RAISE EXCEPTION 'Other customer program opened through this portal'; END IF;
  BEGIN PERFORM public.claim_portal_program_award('programs-'||current_setting('test.pp_org'),current_setting('test.pp_version')::uuid); EXCEPTION WHEN raise_exception THEN denied:=true; END;
  IF NOT denied THEN RAISE EXCEPTION 'Portal awarded incomplete program'; END IF;
  denied:=false;
  BEGIN PERFORM public.claim_portal_program_award('programs-'||current_setting('test.pp_org'),current_setting('test.pp_other_version')::uuid); EXCEPTION WHEN raise_exception THEN denied:=true; END;
  IF NOT denied THEN RAISE EXCEPTION 'Portal awarded another customer program'; END IF;
  result:=public.portal_learning_programs('programs-'||current_setting('test.pp_org'),1,1);
  IF result->>'total'<>'1' OR jsonb_array_length(result->'records')<>0 THEN RAISE EXCEPTION 'Program pagination count incorrect'; END IF;
END;
$learner$;
RESET ROLE;
DO $completion$
DECLARE manifest jsonb;
BEGIN
  INSERT INTO public.lesson_progress(user_id,course_id,lesson_id,completed) SELECT current_setting('test.pp_learner')::uuid,course_id::text,id::text,true FROM public.studio_lessons WHERE course_id=current_setting('test.pp_course')::uuid;
  SELECT jsonb_agg(jsonb_build_object('id',id,'kind',kind,'body',body,'title',title,'video_url',video_url,'quiz',quiz) ORDER BY id) INTO manifest FROM public.studio_lessons WHERE course_id=current_setting('test.pp_course')::uuid;
  PERFORM public.issue_studio_certificate(current_setting('test.pp_learner')::uuid,current_setting('test.pp_course')::uuid,1,manifest,'[]');
END;
$completion$;
SET LOCAL ROLE authenticated;
DO $award$
DECLARE first_ref uuid; retry_ref uuid;
BEGIN
  first_ref:=public.claim_portal_program_award('programs-'||current_setting('test.pp_org'),current_setting('test.pp_version')::uuid);
  retry_ref:=public.claim_portal_program_award('programs-'||current_setting('test.pp_org'),current_setting('test.pp_version')::uuid);
  IF first_ref IS NULL OR first_ref<>retry_ref OR NOT EXISTS(SELECT 1 FROM public.program_awards WHERE id=first_ref AND user_id=auth.uid() AND jsonb_array_length(evidence)=1) THEN RAISE EXCEPTION 'Verified program completion did not retain idempotent evidence'; END IF;
END;
$award$;
SELECT set_config('request.jwt.claim.sub',current_setting('test.pp_outsider'),true);
DO $outsider$
DECLARE denied boolean:=false;
BEGIN
  IF public.portal_program_progress('programs-'||current_setting('test.pp_org'),current_setting('test.pp_version')::uuid) IS NOT NULL THEN RAISE EXCEPTION 'Outsider read program progress'; END IF;
  BEGIN PERFORM public.portal_learning_programs('programs-'||current_setting('test.pp_org')); EXCEPTION WHEN raise_exception THEN denied:=true; END;
  IF NOT denied THEN RAISE EXCEPTION 'Outsider read portal program list'; END IF;
  IF has_function_privilege('anon','public.portal_learning_programs(text,integer,integer)','EXECUTE') OR has_function_privilege('authenticated','public.portal_program_available(text,uuid)','EXECUTE') THEN RAISE EXCEPTION 'Internal program scope functions exposed'; END IF;
END;
$outsider$;
RESET ROLE;
SELECT set_config('request.jwt.claim.sub',current_setting('test.pp_owner'),true);
SELECT public.remove_organization_member(current_setting('test.pp_org')::uuid,current_setting('test.pp_learner')::uuid,1);
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub',current_setting('test.pp_learner'),true);
DO $removed$
DECLARE denied boolean:=false;
BEGIN
  IF public.portal_program_progress('programs-'||current_setting('test.pp_org'),current_setting('test.pp_version')::uuid) IS NOT NULL THEN RAISE EXCEPTION 'Former member retains portal program access'; END IF;
  BEGIN PERFORM public.claim_portal_program_award('programs-'||current_setting('test.pp_org'),current_setting('test.pp_version')::uuid); EXCEPTION WHEN raise_exception THEN denied:=true; END;
  IF NOT denied THEN RAISE EXCEPTION 'Former member claimed through portal'; END IF;
  IF public.portal_program_progress('programs-'||current_setting('test.pp_other_org'),current_setting('test.pp_other_version')::uuid) IS NULL THEN RAISE EXCEPTION 'Removal from one company removed unrelated program assignment'; END IF;
END;
$removed$;
RESET ROLE;
ROLLBACK;
