BEGIN;
DO $fixture$
DECLARE owner_ref uuid; learner_a uuid:=gen_random_uuid(); learner_b uuid:=gen_random_uuid(); org_a uuid:=gen_random_uuid(); org_b uuid:=gen_random_uuid();
  course_ref uuid; native_ref uuid; public_ref uuid; reading_ref uuid; quiz_ref uuid; package_ref uuid; cohort_a uuid; cohort_b uuid; program_ref uuid:=gen_random_uuid(); program_version uuid; manifest jsonb; archive jsonb; denied boolean:=false;
BEGIN
  SELECT user_id INTO owner_ref FROM public.user_roles WHERE role='admin' LIMIT 1;
  INSERT INTO auth.users(id,aud,role,email,created_at,updated_at) VALUES(learner_a,'authenticated','authenticated','boundary-a-'||learner_a||'@example.invalid',now(),now()),(learner_b,'authenticated','authenticated','boundary-b-'||learner_b||'@example.invalid',now(),now());
  PERFORM set_config('request.jwt.claim.sub',owner_ref::text,true);
  PERFORM public.save_organization(org_a,'Boundary organization A','','#123456',NULL,0); PERFORM public.save_organization(org_b,'Boundary organization B','','#654321',NULL,0);
  PERFORM public.set_organization_member(org_a,'boundary-a-'||learner_a||'@example.invalid','learner',NULL,NULL,'Learner A',0);
  PERFORM public.set_organization_member(org_b,'boundary-b-'||learner_b||'@example.invalid','learner',NULL,NULL,'Learner B',0);
  INSERT INTO public.studio_courses(author_id,title,description,price_cents) VALUES(owner_ref,'Private boundary course','Private lessons, assessment and package content',2000) RETURNING id INTO course_ref;
  INSERT INTO public.studio_lessons(course_id,title,kind,body,position) VALUES(course_ref,'Read','reading','Organization A training content',0) RETURNING id INTO reading_ref;
  INSERT INTO public.studio_lessons(course_id,title,kind,body,position) VALUES(course_ref,'Quiz','quiz','',1) RETURNING id INTO quiz_ref;
  PERFORM public.studio_save_quiz(quiz_ref,'Quiz',75,'[{"kind":"boolean","q":"Private training complete?"}]','[0]');
  INSERT INTO public.scorm_packages(author_id,title,entry_path,entry_url) VALUES(owner_ref,'Private package fixture',owner_ref::text||'/fixture/index.html','https://example.com/index.html') RETURNING id INTO package_ref;
  INSERT INTO public.studio_lessons(course_id,title,kind,body,position) VALUES(course_ref,'Package','scorm','scorm:'||package_ref,2);
  PERFORM public.set_course_organization(course_ref,org_a,NULL);
  PERFORM public.studio_approve_review(course_ref); PERFORM public.studio_publish_version(course_ref,'Organization boundary fixture');
  INSERT INTO public.studio_courses(author_id,title,description) VALUES(owner_ref,'Private native archive','Native privacy round trip with organization-scoped course content') RETURNING id INTO native_ref;
  INSERT INTO public.studio_lessons(course_id,title,kind,body,position) VALUES(native_ref,'Native reading','reading','Private native content',0);
  PERFORM public.set_course_organization(native_ref,org_a,NULL); PERFORM public.studio_approve_review(native_ref); PERFORM public.studio_publish_version(native_ref,'Private archive fixture');
  archive:=public.export_course_archive(native_ref);
  IF archive->'snapshot'->>'organization_id'<>org_a::text THEN RAISE EXCEPTION 'Private archive dropped its organization'; END IF;
  INSERT INTO public.studio_courses(author_id,title,description) VALUES(owner_ref,'Public control fixture','Public catalog must remain available') RETURNING id INTO public_ref;
  INSERT INTO public.studio_lessons(course_id,title,kind,body,position) VALUES(public_ref,'Public reading','reading','Public training content',0);
  PERFORM public.studio_approve_review(public_ref); PERFORM public.studio_publish_version(public_ref,'Public control fixture');
  INSERT INTO public.course_enrollments(user_id,course_id,payment_status,amount_cents) VALUES(learner_a,course_ref,'paid',2000),(learner_b,course_ref,'paid',2000);
  INSERT INTO public.lesson_progress(user_id,course_id,lesson_id,completed) VALUES(learner_a,course_ref::text,reading_ref::text,true);
  INSERT INTO public.quiz_attempts(user_id,course_id,lesson_id,score,passed) VALUES(learner_a,course_ref::text,quiz_ref::text,100,true);
  INSERT INTO public.scorm_attempts(user_id,package_id,lesson_status) VALUES(learner_a,package_ref,'completed');
  SELECT jsonb_agg(jsonb_build_object('id',id,'kind',kind,'body',body,'title',title,'video_url',video_url,'quiz',quiz) ORDER BY id) INTO manifest FROM public.studio_lessons WHERE course_id=course_ref;
  PERFORM public.issue_studio_certificate(learner_a,course_ref,1,manifest,'[]');
  INSERT INTO public.certificates(user_id,source,course_ref,title) VALUES(learner_b,'studio',course_ref::text,'Prior historical completion');
  INSERT INTO public.community_members(course_id,user_id) VALUES(course_ref,learner_a),(course_ref,learner_b);
  INSERT INTO public.community_messages(course_id,user_id,body) VALUES(course_ref,learner_a,'Rollback-only synthetic private community message');
  INSERT INTO public.cohorts(name,owner_id) VALUES('Organization A cohort',owner_ref) RETURNING id INTO cohort_a;
  INSERT INTO public.cohorts(name,owner_id) VALUES('Organization B cohort',owner_ref) RETURNING id INTO cohort_b;
  INSERT INTO public.cohort_members(cohort_id,user_id) VALUES(cohort_a,learner_a),(cohort_b,learner_b);
  PERFORM public.bind_organization_cohort(cohort_a,org_a,NULL); PERFORM public.bind_organization_cohort(cohort_b,org_b,NULL);
  INSERT INTO public.cohort_course_assignments(cohort_id,course_id) VALUES(cohort_a,course_ref);
  BEGIN INSERT INTO public.cohort_course_assignments(cohort_id,course_id) VALUES(cohort_b,course_ref); EXCEPTION WHEN raise_exception THEN denied:=true; END;
  IF NOT denied THEN RAISE EXCEPTION 'Private course assigned across tenant boundary'; END IF;
  denied:=false; BEGIN INSERT INTO public.cohort_members(cohort_id,user_id) VALUES(cohort_a,learner_b); EXCEPTION WHEN raise_exception THEN denied:=true; END;
  IF NOT denied THEN RAISE EXCEPTION 'Other-tenant member added to private cohort'; END IF;
  PERFORM public.save_learning_program(program_ref,'Private program','Private program fixture',jsonb_build_array(jsonb_build_object('title','Foundation','required',1,'course_ids',jsonb_build_array(course_ref))),0);
  program_version:=public.publish_learning_program(program_ref,1);
  PERFORM public.assign_cohort_program(cohort_a,program_version,NULL,true,0);
  denied:=false; BEGIN PERFORM public.assign_cohort_program(cohort_b,program_version,NULL,true,0); EXCEPTION WHEN raise_exception THEN denied:=true; END;
  IF NOT denied THEN RAISE EXCEPTION 'Private program assigned across tenants'; END IF;
  PERFORM public.set_cohort_report_manager(cohort_a,learner_a,true);
  PERFORM set_config('test.bound_owner',owner_ref::text,true); PERFORM set_config('test.bound_a',learner_a::text,true); PERFORM set_config('test.bound_b',learner_b::text,true); PERFORM set_config('test.bound_org',org_a::text,true);
  PERFORM set_config('test.bound_course',course_ref::text,true); PERFORM set_config('test.bound_native',native_ref::text,true); PERFORM set_config('test.bound_public',public_ref::text,true); PERFORM set_config('test.bound_package',package_ref::text,true);
  PERFORM set_config('test.bound_cohort',cohort_a::text,true); PERFORM set_config('test.bound_program',program_version::text,true); PERFORM set_config('test.bound_manifest',manifest::text,true); PERFORM set_config('test.bound_archive',archive::text,true);
END;
$fixture$;
SET LOCAL ROLE anon;
SELECT set_config('request.jwt.claim.sub','',true);
DO $anonymous$
BEGIN
  IF EXISTS(SELECT 1 FROM public.studio_courses WHERE id=current_setting('test.bound_course')::uuid) OR EXISTS(SELECT 1 FROM public.studio_lessons WHERE course_id=current_setting('test.bound_course')::uuid) THEN RAISE EXCEPTION 'Anonymous visitor reads private content'; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.studio_courses WHERE id=current_setting('test.bound_public')::uuid) THEN RAISE EXCEPTION 'Tenant boundary hides public courses'; END IF;
END;
$anonymous$;
RESET ROLE;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub',current_setting('test.bound_b'),true);
DO $other_tenant$
DECLARE denied boolean:=false; before_count bigint;
BEGIN
  IF EXISTS(SELECT 1 FROM public.studio_courses WHERE id=current_setting('test.bound_course')::uuid) OR public.studio_course_visible(current_setting('test.bound_course')::uuid)
    OR public.scorm_package_visible(current_setting('test.bound_package')::uuid) OR EXISTS(SELECT 1 FROM public.community_messages WHERE course_id=current_setting('test.bound_course')::uuid)
    OR EXISTS(SELECT 1 FROM public.community_roster(current_setting('test.bound_course')::uuid)) THEN RAISE EXCEPTION 'Personal purchase or historical community membership bypasses tenant privacy'; END IF;
  SELECT count(*) INTO before_count FROM public.studio_courses WHERE author_id=auth.uid();
  BEGIN PERFORM public.restore_course_archive(gen_random_uuid(),current_setting('test.bound_archive')::jsonb); EXCEPTION WHEN raise_exception THEN denied:=true; END;
  IF NOT denied OR (SELECT count(*) FROM public.studio_courses WHERE author_id=auth.uid())<>before_count THEN RAISE EXCEPTION 'Private archive restored outside its organization'; END IF;
END;
$other_tenant$;
SELECT set_config('request.jwt.claim.sub',current_setting('test.bound_a'),true);
DO $member$
DECLARE restored uuid;
BEGIN
  IF NOT public.studio_course_visible(current_setting('test.bound_course')::uuid) OR NOT public.scorm_package_visible(current_setting('test.bound_package')::uuid) THEN RAISE EXCEPTION 'Authorized paid organization learner denied'; END IF;
  IF (SELECT count(*) FROM public.studio_lessons WHERE course_id=current_setting('test.bound_course')::uuid)<>3 OR (SELECT count(*) FROM public.community_members WHERE course_id=current_setting('test.bound_course')::uuid)<>1 THEN RAISE EXCEPTION 'Authorized native or scoped community read failed'; END IF;
  IF (SELECT count(*) FROM public.community_roster(current_setting('test.bound_course')::uuid))<>1 THEN RAISE EXCEPTION 'Other-tenant alumni exposed in roster'; END IF;
  restored:=public.restore_course_archive(gen_random_uuid(),current_setting('test.bound_archive')::jsonb);
  IF NOT EXISTS(SELECT 1 FROM public.organization_courses WHERE course_id=restored AND organization_id=current_setting('test.bound_org')::uuid) THEN RAISE EXCEPTION 'Restore silently made private course public'; END IF;
  PERFORM public.claim_program_award(current_setting('test.bound_program')::uuid);
END;
$member$;
SELECT set_config('request.jwt.claim.sub',current_setting('test.bound_owner'),true);
DO $copies$
DECLARE copied uuid; revised uuid; denied boolean:=false;
BEGIN
  copied:=public.studio_copy_draft(current_setting('test.bound_native')::uuid,false); revised:=public.studio_copy_draft(current_setting('test.bound_native')::uuid,true);
  IF (SELECT count(*) FROM public.organization_courses WHERE course_id IN(copied,revised) AND organization_id=current_setting('test.bound_org')::uuid)<>2 THEN RAISE EXCEPTION 'Course copy or revision lost private organization'; END IF;
  BEGIN PERFORM public.set_course_organization(current_setting('test.bound_course')::uuid,NULL,current_setting('test.bound_org')::uuid); EXCEPTION WHEN raise_exception THEN denied:=true; END;
  IF NOT denied THEN RAISE EXCEPTION 'Published privacy changed without unpublishing'; END IF;
  PERFORM public.remove_organization_member(current_setting('test.bound_org')::uuid,current_setting('test.bound_a')::uuid,1);
END;
$copies$;
SELECT set_config('request.jwt.claim.sub',current_setting('test.bound_a'),true);
DO $removed$
DECLARE denied boolean:=false;
BEGIN
  IF public.studio_course_visible(current_setting('test.bound_course')::uuid) OR public.my_community_access(current_setting('test.bound_course')::uuid)
    OR public.cohort_report_access(current_setting('test.bound_cohort')::uuid) OR EXISTS(SELECT 1 FROM public.my_learning_programs() WHERE id=current_setting('test.bound_program')::uuid)
    OR EXISTS(SELECT 1 FROM public.community_messages WHERE course_id=current_setting('test.bound_course')::uuid) THEN RAISE EXCEPTION 'Former member retains private learning, community or reporting access'; END IF;
  BEGIN PERFORM public.community_join(current_setting('test.bound_course')::uuid); EXCEPTION WHEN raise_exception THEN denied:=true; END;
  IF NOT denied THEN RAISE EXCEPTION 'Former member rejoins private community'; END IF;
END;
$removed$;
RESET ROLE;
SET LOCAL ROLE service_role;
DO $finalization$
DECLARE denied boolean:=false;
BEGIN
  BEGIN PERFORM public.issue_studio_certificate(current_setting('test.bound_a')::uuid,current_setting('test.bound_course')::uuid,1,current_setting('test.bound_manifest')::jsonb,'[]'); EXCEPTION WHEN raise_exception THEN denied:=true; END;
  IF NOT denied THEN RAISE EXCEPTION 'Removed organization member claimed certificate'; END IF;
END;
$finalization$;
RESET ROLE;
DO $preserved$
BEGIN
  IF NOT EXISTS(SELECT 1 FROM public.course_enrollments WHERE user_id=current_setting('test.bound_a')::uuid AND course_id=current_setting('test.bound_course')::uuid AND payment_status='paid')
    OR NOT EXISTS(SELECT 1 FROM public.certificates WHERE user_id=current_setting('test.bound_a')::uuid AND course_ref=current_setting('test.bound_course') AND revoked_at IS NULL) THEN RAISE EXCEPTION 'Organization removal rewrote independent purchases or historical achievements'; END IF;
  IF EXISTS(SELECT 1 FROM public.cohort_members WHERE cohort_id=current_setting('test.bound_cohort')::uuid AND user_id=current_setting('test.bound_a')::uuid) THEN RAISE EXCEPTION 'Former member remains in organization cohort'; END IF;
END;
$preserved$;
ROLLBACK;
