BEGIN;
DO $fixture$
DECLARE owner_ref uuid; learner_ref uuid:=gen_random_uuid(); course_ref uuid; reading_ref uuid; quiz_ref uuid; slide_ref uuid; cert_ref uuid; child_ref uuid;
BEGIN
  SELECT user_id INTO owner_ref FROM public.user_roles WHERE role='admin' LIMIT 1;
  IF owner_ref IS NULL THEN RAISE EXCEPTION 'Fixture administrator required'; END IF;
  PERFORM set_config('request.jwt.claim.sub',owner_ref::text,true);
  INSERT INTO public.studio_courses(author_id,title,description) VALUES(owner_ref,'Rollback-only renewable course','Certificate renewal lifecycle fixture') RETURNING id INTO course_ref;
  INSERT INTO public.studio_lessons(course_id,title,kind,body,position) VALUES(course_ref,'Read','reading','Training content',0) RETURNING id INTO reading_ref;
  INSERT INTO public.studio_lessons(course_id,title,kind,body,position) VALUES(course_ref,'Assess','quiz','',1) RETURNING id INTO quiz_ref;
  PERFORM public.studio_save_quiz(quiz_ref,'Assess',75,'[{"kind":"boolean","q":"Training complete?"}]','[0]');
  INSERT INTO public.studio_lessons(course_id,title,kind,body,position) VALUES(course_ref,'Practical','slide',E'## Evidence\n:::photo\nShow the practical technique.\n:::',2) RETURNING id INTO slide_ref;
  PERFORM public.set_course_certificate_policy(course_ref,30,10,0,'A thirty day certification policy for verification.');
  PERFORM public.studio_approve_review(course_ref);
  PERFORM public.studio_publish_version(course_ref,'Certificate lifecycle fixture');
  INSERT INTO auth.users(id,aud,role,email,created_at,updated_at) VALUES(learner_ref,'authenticated','authenticated','certificate-fixture-'||learner_ref||'@example.invalid',now(),now());
  INSERT INTO public.profiles(user_id,full_name,region,learner_role) VALUES(learner_ref,'Synthetic Certificate Learner','Test','Learner');
  INSERT INTO public.lesson_progress(user_id,course_id,lesson_id,completed) VALUES(learner_ref,course_ref::text,reading_ref::text,true);
  INSERT INTO public.lesson_progress(user_id,course_id,lesson_id,completed) VALUES(learner_ref,course_ref::text,slide_ref::text,true);
  INSERT INTO public.lesson_photo_submissions(user_id,lesson_id,block_index,photo_path,status,reviewed_by,reviewed_at) VALUES(learner_ref,slide_ref,1,'rollback-photo','approved',owner_ref,clock_timestamp()-interval '2 days');
  INSERT INTO public.quiz_attempts(user_id,course_id,lesson_id,score,passed,created_at) VALUES(learner_ref,course_ref::text,quiz_ref::text,100,true,clock_timestamp()-interval '2 days');
  PERFORM set_config('test.life_owner',owner_ref::text,true);
  PERFORM set_config('test.life_learner',learner_ref::text,true);
  PERFORM set_config('test.life_course',course_ref::text,true);
  PERFORM set_config('test.life_quiz',quiz_ref::text,true);
  PERFORM set_config('test.life_tasks',jsonb_build_array(jsonb_build_object('lessonId',slide_ref,'blockIndex',1))::text,true);
  PERFORM set_config('test.life_manifest',(SELECT jsonb_agg(jsonb_build_object('id',id,'kind',kind,'body',body,'title',title,'video_url',video_url,'quiz',quiz) ORDER BY id)::text FROM public.studio_lessons WHERE course_id=course_ref),true);
  cert_ref:=(public.issue_studio_certificate(learner_ref,course_ref,1,current_setting('test.life_manifest')::jsonb,current_setting('test.life_tasks')::jsonb)->>'id')::uuid;
  PERFORM set_config('test.life_cert',cert_ref::text,true);
  IF NOT EXISTS(SELECT 1 FROM public.certificates WHERE id=cert_ref AND expires_at=validated_at+interval '30 days') THEN RAISE EXCEPTION 'Validity snapshot missing'; END IF;
  PERFORM public.set_course_certificate_policy(course_ref,60,10,1,'New awards use a longer sixty day certificate policy.');
  IF NOT EXISTS(SELECT 1 FROM public.certificates WHERE id=cert_ref AND expires_at=validated_at+interval '30 days') THEN RAISE EXCEPTION 'Policy rewrote existing certificate'; END IF;
  INSERT INTO public.studio_courses(author_id,title,description,prerequisite_course_id) VALUES(owner_ref,'Dependent course','Expiry prerequisite fixture',course_ref) RETURNING id INTO child_ref;
  PERFORM set_config('test.life_child',child_ref::text,true);
  IF has_table_privilege('authenticated','public.certificate_renewals','INSERT') OR has_function_privilege('authenticated','public.certificate_is_current(uuid)','EXECUTE') THEN RAISE EXCEPTION 'Private lifecycle grants exposed'; END IF;
END;
$fixture$;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub',current_setting('test.life_learner'),true);
DO $sharing$
DECLARE denied boolean:=false; token uuid; cycle uuid;
BEGIN
  IF public.verify_certificate(gen_random_uuid()) IS NOT NULL THEN RAISE EXCEPTION 'Random public token exposed certificate'; END IF;
  IF public.my_certificate_lifecycle(current_setting('test.life_cert')::uuid)->'share'<>'null'::jsonb THEN RAISE EXCEPTION 'Sharing enabled by default'; END IF;
  token:=public.set_certificate_sharing(current_setting('test.life_cert')::uuid,true);
  PERFORM set_config('test.life_token',token::text,true);
  IF public.verify_certificate(token)->>'learner_name'<>'Synthetic Certificate Learner' THEN RAISE EXCEPTION 'Public name missing'; END IF;
  IF public.verify_certificate(token) ?| ARRAY['user_id','email','revocation_reason','certificate_id','course_ref'] THEN RAISE EXCEPTION 'Verification exposed private fields'; END IF;
  BEGIN PERFORM public.start_certificate_renewal(current_setting('test.life_cert')::uuid); EXCEPTION WHEN raise_exception THEN denied:=SQLERRM LIKE 'The renewal window%'; END;
  IF NOT denied THEN RAISE EXCEPTION 'Premature renewal allowed'; END IF;
  IF NOT public.studio_prerequisite_satisfied(current_setting('test.life_child')::uuid) THEN RAISE EXCEPTION 'Current certificate cannot satisfy prerequisite'; END IF;
END;
$sharing$;
RESET ROLE;
UPDATE public.certificates SET expires_at=clock_timestamp()-interval '1 day' WHERE id=current_setting('test.life_cert')::uuid;
SET LOCAL ROLE authenticated;
DO $renewal_start$
DECLARE first_ref uuid; second_ref uuid;
BEGIN
  IF public.studio_prerequisite_satisfied(current_setting('test.life_child')::uuid) THEN RAISE EXCEPTION 'Expired prerequisite accepted'; END IF;
  first_ref:=public.start_certificate_renewal(current_setting('test.life_cert')::uuid);
  second_ref:=public.start_certificate_renewal(current_setting('test.life_cert')::uuid);
  IF first_ref<>second_ref THEN RAISE EXCEPTION 'Duplicate open renewal'; END IF;
  PERFORM set_config('test.life_cycle',first_ref::text,true);
END;
$renewal_start$;
RESET ROLE;
SET LOCAL ROLE service_role;
DO $stale_pass$
DECLARE denied boolean:=false;
BEGIN
  BEGIN PERFORM public.issue_studio_certificate(current_setting('test.life_learner')::uuid,current_setting('test.life_course')::uuid,1,current_setting('test.life_manifest')::jsonb,current_setting('test.life_tasks')::jsonb);
    EXCEPTION WHEN raise_exception THEN denied:=SQLERRM LIKE 'Pass every quiz again%'; END;
  IF NOT denied THEN RAISE EXCEPTION 'Earlier quiz pass renewed certificate'; END IF;
END;
$stale_pass$;
RESET ROLE;
INSERT INTO public.quiz_attempts(user_id,course_id,lesson_id,score,passed,created_at) VALUES(current_setting('test.life_learner')::uuid,current_setting('test.life_course'),current_setting('test.life_quiz'),100,true,clock_timestamp());
SET LOCAL ROLE service_role;
DO $stale_photo$
DECLARE denied boolean:=false;
BEGIN
  BEGIN PERFORM public.issue_studio_certificate(current_setting('test.life_learner')::uuid,current_setting('test.life_course')::uuid,1,current_setting('test.life_manifest')::jsonb,current_setting('test.life_tasks')::jsonb);
    EXCEPTION WHEN raise_exception THEN denied:=SQLERRM LIKE 'Your trainer must approve practical photos again%'; END;
  IF NOT denied THEN RAISE EXCEPTION 'Earlier photo approval renewed certificate'; END IF;
END;
$stale_photo$;
RESET ROLE;
UPDATE public.lesson_photo_submissions SET reviewed_at=clock_timestamp() WHERE user_id=current_setting('test.life_learner')::uuid;
SET LOCAL ROLE service_role;
DO $renewed$
DECLARE result jsonb;
BEGIN
  result:=public.issue_studio_certificate(current_setting('test.life_learner')::uuid,current_setting('test.life_course')::uuid,1,current_setting('test.life_manifest')::jsonb,current_setting('test.life_tasks')::jsonb);
  IF result->>'id'<>current_setting('test.life_cert') THEN RAISE EXCEPTION 'Renewal replaced original credential'; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.certificate_renewals WHERE id=current_setting('test.life_cycle')::uuid AND completed_at IS NOT NULL AND expires_at=completed_at+interval '60 days' AND course_version=1) THEN RAISE EXCEPTION 'Renewal snapshot missing'; END IF;
  PERFORM public.issue_studio_certificate(current_setting('test.life_learner')::uuid,current_setting('test.life_course')::uuid,1,current_setting('test.life_manifest')::jsonb,current_setting('test.life_tasks')::jsonb);
  IF (SELECT count(*) FROM public.certificate_renewals WHERE certificate_id=current_setting('test.life_cert')::uuid)<>1 THEN RAISE EXCEPTION 'Retry created another renewal'; END IF;
END;
$renewed$;
RESET ROLE;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub',current_setting('test.life_learner'),true);
DO $renewed_visibility$
DECLARE fresh_token uuid;
BEGIN
  IF NOT public.studio_prerequisite_satisfied(current_setting('test.life_child')::uuid) THEN RAISE EXCEPTION 'Renewal did not restore prerequisite'; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.my_certificate_records() WHERE id=current_setting('test.life_cert')::uuid AND expires_at>clock_timestamp()) THEN RAISE EXCEPTION 'Learner sees original expiry instead of renewal'; END IF;
  PERFORM public.set_certificate_sharing(current_setting('test.life_cert')::uuid,false);
  IF public.verify_certificate(current_setting('test.life_token')::uuid) IS NOT NULL THEN RAISE EXCEPTION 'Disabled sharing remains visible'; END IF;
  fresh_token:=public.set_certificate_sharing(current_setting('test.life_cert')::uuid,true);
  IF fresh_token=current_setting('test.life_token')::uuid OR public.verify_certificate(current_setting('test.life_token')::uuid) IS NOT NULL THEN RAISE EXCEPTION 'Old sharing token resurrected'; END IF;
  PERFORM set_config('test.life_token',fresh_token::text,true);
END;
$renewed_visibility$;
SELECT set_config('request.jwt.claim.sub',gen_random_uuid()::text,true);
DO $outsider$
DECLARE denied boolean:=false;
BEGIN
  IF public.my_certificate_lifecycle(current_setting('test.life_cert')::uuid) IS NOT NULL THEN RAISE EXCEPTION 'Outsider sees lifecycle'; END IF;
  IF EXISTS(SELECT 1 FROM public.my_certificate_records() WHERE id=current_setting('test.life_cert')::uuid) THEN RAISE EXCEPTION 'Outsider lists certificate'; END IF;
  BEGIN PERFORM public.set_certificate_sharing(current_setting('test.life_cert')::uuid,false); EXCEPTION WHEN raise_exception THEN denied:=true; END;
  IF NOT denied THEN RAISE EXCEPTION 'Outsider changed sharing'; END IF;
END;
$outsider$;
SELECT set_config('request.jwt.claim.sub',current_setting('test.life_owner'),true);
SELECT public.revoke_studio_certificate(current_setting('test.life_cert')::uuid,'The practical assessment was invalidated after an audit.');
RESET ROLE;
SET LOCAL ROLE anon;
DO $public_revocation$
BEGIN
  IF public.verify_certificate(current_setting('test.life_token')::uuid)->>'revoked_at' IS NULL THEN RAISE EXCEPTION 'Public view hides revocation'; END IF;
END;
$public_revocation$;
RESET ROLE;
DO $preserved$
BEGIN
  IF NOT EXISTS(SELECT 1 FROM public.certificates WHERE id=current_setting('test.life_cert')::uuid AND expires_at<clock_timestamp() AND revoked_at IS NOT NULL AND course_version=1) THEN RAISE EXCEPTION 'Original certificate was rewritten'; END IF;
  IF (SELECT count(*) FROM public.certificate_renewals WHERE certificate_id=current_setting('test.life_cert')::uuid AND completed_at IS NOT NULL)<>1 THEN RAISE EXCEPTION 'Renewal history lost'; END IF;
END;
$preserved$;
ROLLBACK;
