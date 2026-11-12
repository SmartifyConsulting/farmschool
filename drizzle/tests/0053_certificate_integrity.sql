BEGIN;
DO $fixture$
DECLARE owner_ref uuid; course_ref uuid; reading_ref uuid; quiz_ref uuid; slide_ref uuid; package_ref uuid; learner_ref uuid:=gen_random_uuid();
BEGIN
  SELECT user_id INTO owner_ref FROM public.user_roles WHERE role='admin' LIMIT 1;
  IF owner_ref IS NULL THEN RAISE EXCEPTION 'Fixture owner required'; END IF;
  PERFORM set_config('request.jwt.claim.sub',owner_ref::text,true);
  INSERT INTO public.studio_courses(author_id,title,description,price_cents) VALUES(owner_ref,'Rollback-only certificate fixture','Verified practical training with reading, quiz, SCORM and trainer-approved evidence.',2000) RETURNING id INTO course_ref;
  INSERT INTO public.studio_lessons(course_id,title,kind,body,position) VALUES(course_ref,'Reading','reading','Practical course notes',0) RETURNING id INTO reading_ref;
  INSERT INTO public.studio_lessons(course_id,title,kind,body,position) VALUES(course_ref,'Quiz','quiz','',1) RETURNING id INTO quiz_ref;
  PERFORM public.studio_save_quiz(quiz_ref,'Quiz',75,'[{"kind":"boolean","q":"Water is required?"}]','[0]');
  INSERT INTO public.studio_lessons(course_id,title,kind,body,position) VALUES(course_ref,'Photo','slide',E'## Evidence\n:::photo\nShow the practical technique.\n:::',2) RETURNING id INTO slide_ref;
  INSERT INTO public.scorm_packages(author_id,title,entry_path,entry_url) VALUES(owner_ref,'Certificate fixture package',owner_ref::text||'/test/index.html','https://example.com/test/index.html') RETURNING id INTO package_ref;
  INSERT INTO public.studio_lessons(course_id,title,kind,body,position) VALUES(course_ref,'Package','scorm','scorm:'||package_ref,3);
  PERFORM public.studio_approve_review(course_ref);
  PERFORM public.studio_publish_version(course_ref,'Rollback-only certificate test');
  INSERT INTO public.course_enrollments(user_id,course_id,payment_status,amount_cents) VALUES(learner_ref,course_ref,'paid',2000);
  PERFORM set_config('test.cert_owner',owner_ref::text,true);
  PERFORM set_config('test.cert_learner',learner_ref::text,true);
  PERFORM set_config('test.cert_course',course_ref::text,true);
  PERFORM set_config('test.cert_reading',reading_ref::text,true);
  PERFORM set_config('test.cert_quiz',quiz_ref::text,true);
  PERFORM set_config('test.cert_slide',slide_ref::text,true);
  PERFORM set_config('test.cert_package',package_ref::text,true);
  PERFORM set_config('test.cert_manifest',(SELECT jsonb_agg(jsonb_build_object('id',id,'kind',kind,'body',body,'title',title,'video_url',video_url,'quiz',quiz) ORDER BY id)::text FROM public.studio_lessons WHERE course_id=course_ref),true);
  PERFORM set_config('test.cert_tasks',jsonb_build_array(jsonb_build_object('lessonId',slide_ref,'blockIndex',1))::text,true);
  IF has_function_privilege('authenticated','public.issue_studio_certificate(uuid,uuid,integer,jsonb,jsonb)','EXECUTE')
    OR has_function_privilege('anon','public.issue_studio_certificate(uuid,uuid,integer,jsonb,jsonb)','EXECUTE')
    OR NOT has_function_privilege('service_role','public.issue_studio_certificate(uuid,uuid,integer,jsonb,jsonb)','EXECUTE') THEN RAISE EXCEPTION 'Issuance privileges incorrect'; END IF;
END;
$fixture$;
SET LOCAL ROLE service_role;
DO $incomplete$
DECLARE denied boolean:=false;
BEGIN
  BEGIN PERFORM public.issue_studio_certificate(current_setting('test.cert_learner')::uuid,current_setting('test.cert_course')::uuid,1,current_setting('test.cert_manifest')::jsonb,current_setting('test.cert_tasks')::jsonb);
    EXCEPTION WHEN raise_exception THEN denied:=true; END;
  IF NOT denied THEN RAISE EXCEPTION 'Incomplete course certified'; END IF;
END;
$incomplete$;
RESET ROLE;
INSERT INTO public.lesson_progress(user_id,course_id,lesson_id,completed,position_seconds)
  SELECT current_setting('test.cert_learner')::uuid,current_setting('test.cert_course'),id::text,true,0 FROM public.studio_lessons WHERE course_id=current_setting('test.cert_course')::uuid AND kind IN('reading','slide');
INSERT INTO public.quiz_attempts(user_id,course_id,lesson_id,score,passed) VALUES(current_setting('test.cert_learner')::uuid,current_setting('test.cert_course'),current_setting('test.cert_quiz'),100,true);
SET LOCAL ROLE service_role;
DO $package_missing$
DECLARE denied boolean:=false;
BEGIN
  BEGIN PERFORM public.issue_studio_certificate(current_setting('test.cert_learner')::uuid,current_setting('test.cert_course')::uuid,1,current_setting('test.cert_manifest')::jsonb,current_setting('test.cert_tasks')::jsonb);
    EXCEPTION WHEN raise_exception THEN denied:=SQLERRM LIKE 'Finish every learning package%'; END;
  IF NOT denied THEN RAISE EXCEPTION 'Missing SCORM completion accepted'; END IF;
END;
$package_missing$;
RESET ROLE;
INSERT INTO public.scorm_attempts(user_id,package_id,lesson_status) VALUES(current_setting('test.cert_learner')::uuid,current_setting('test.cert_package')::uuid,'completed');
SET LOCAL ROLE service_role;
DO $photo_missing$
DECLARE denied boolean:=false;
BEGIN
  BEGIN PERFORM public.issue_studio_certificate(current_setting('test.cert_learner')::uuid,current_setting('test.cert_course')::uuid,1,current_setting('test.cert_manifest')::jsonb,current_setting('test.cert_tasks')::jsonb);
    EXCEPTION WHEN raise_exception THEN denied:=SQLERRM LIKE 'Your trainer must approve%'; END;
  IF NOT denied THEN RAISE EXCEPTION 'Missing trainer approval accepted'; END IF;
END;
$photo_missing$;
RESET ROLE;
INSERT INTO public.lesson_photo_submissions(user_id,lesson_id,block_index,photo_path,status,reviewed_by) VALUES(current_setting('test.cert_learner')::uuid,current_setting('test.cert_slide')::uuid,1,'rollback-only-photo','approved',gen_random_uuid());
DO $stale_and_untrusted$
DECLARE denied boolean:=false;
BEGIN
  BEGIN PERFORM public.issue_studio_certificate(current_setting('test.cert_learner')::uuid,current_setting('test.cert_course')::uuid,2,current_setting('test.cert_manifest')::jsonb,current_setting('test.cert_tasks')::jsonb);
    EXCEPTION WHEN raise_exception THEN denied:=SQLERRM LIKE 'The course changed%'; END;
  IF NOT denied THEN RAISE EXCEPTION 'Stale course version accepted'; END IF;
  denied:=false;
  BEGIN PERFORM public.issue_studio_certificate(current_setting('test.cert_learner')::uuid,current_setting('test.cert_course')::uuid,1,'[]',current_setting('test.cert_tasks')::jsonb);
    EXCEPTION WHEN raise_exception THEN denied:=SQLERRM LIKE 'The course changed%'; END;
  IF NOT denied THEN RAISE EXCEPTION 'Changed curriculum accepted'; END IF;
  denied:=false;
  BEGIN PERFORM public.issue_studio_certificate(current_setting('test.cert_learner')::uuid,current_setting('test.cert_course')::uuid,1,current_setting('test.cert_manifest')::jsonb,current_setting('test.cert_tasks')::jsonb);
    EXCEPTION WHEN raise_exception THEN denied:=SQLERRM LIKE 'Your trainer must approve%'; END;
  IF NOT denied THEN RAISE EXCEPTION 'Untrusted trainer approval accepted'; END IF;
END;
$stale_and_untrusted$;
UPDATE public.lesson_photo_submissions SET reviewed_by=current_setting('test.cert_owner')::uuid WHERE lesson_id=current_setting('test.cert_slide')::uuid;
SET LOCAL ROLE service_role;
DO $issue$
DECLARE first_result jsonb; second_result jsonb;
BEGIN
  first_result:=public.issue_studio_certificate(current_setting('test.cert_learner')::uuid,current_setting('test.cert_course')::uuid,1,current_setting('test.cert_manifest')::jsonb,current_setting('test.cert_tasks')::jsonb);
  second_result:=public.issue_studio_certificate(current_setting('test.cert_learner')::uuid,current_setting('test.cert_course')::uuid,1,current_setting('test.cert_manifest')::jsonb,current_setting('test.cert_tasks')::jsonb);
  IF first_result IS DISTINCT FROM second_result THEN RAISE EXCEPTION 'Retry issued a different certificate'; END IF;
  PERFORM set_config('test.cert_id',first_result->>'id',true);
  IF NOT EXISTS(SELECT 1 FROM public.certificates WHERE id=(first_result->>'id')::uuid AND course_version=1 AND validated_at IS NOT NULL AND curriculum_digest IS NOT NULL AND revoked_at IS NULL) THEN RAISE EXCEPTION 'Validation snapshot missing'; END IF;
  IF auth.uid() IS DISTINCT FROM current_setting('test.cert_owner')::uuid THEN RAISE EXCEPTION 'Issuer leaked learner identity'; END IF;
END;
$issue$;
RESET ROLE;
UPDATE public.course_enrollments SET payment_status='refunded' WHERE course_id=current_setting('test.cert_course')::uuid;
DO $refunded$
DECLARE denied boolean:=false;
BEGIN
  BEGIN PERFORM public.issue_studio_certificate(current_setting('test.cert_learner')::uuid,current_setting('test.cert_course')::uuid,1,current_setting('test.cert_manifest')::jsonb,current_setting('test.cert_tasks')::jsonb);
    EXCEPTION WHEN raise_exception THEN denied:=SQLERRM LIKE 'This course is not available%'; END;
  IF NOT denied THEN RAISE EXCEPTION 'Refunded learner could claim'; END IF;
END;
$refunded$;
UPDATE public.course_enrollments SET payment_status='paid' WHERE course_id=current_setting('test.cert_course')::uuid;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub',current_setting('test.cert_learner'),true);
DO $learner$
DECLARE denied boolean:=false;
BEGIN
  IF NOT EXISTS(SELECT 1 FROM public.certificates WHERE id=current_setting('test.cert_id')::uuid) THEN RAISE EXCEPTION 'Learner cannot read certificate'; END IF;
  BEGIN PERFORM public.revoke_studio_certificate(current_setting('test.cert_id')::uuid,'Learners must not revoke their own certificates.'); EXCEPTION WHEN raise_exception THEN denied:=true; END;
  IF NOT denied THEN RAISE EXCEPTION 'Learner can revoke'; END IF;
  denied:=false;
  BEGIN PERFORM public.issue_studio_certificate(current_setting('test.cert_learner')::uuid,current_setting('test.cert_course')::uuid,1,'[]','[]'); EXCEPTION WHEN insufficient_privilege THEN denied:=true; END;
  IF NOT denied THEN RAISE EXCEPTION 'Learner can forge issuance'; END IF;
  denied:=false;
  BEGIN PERFORM public.course_certificates(current_setting('test.cert_course')::uuid); EXCEPTION WHEN raise_exception THEN denied:=true; END;
  IF NOT denied THEN RAISE EXCEPTION 'Learner can list everyone'; END IF;
END;
$learner$;
SELECT set_config('request.jwt.claim.sub',gen_random_uuid()::text,true);
DO $$ BEGIN IF EXISTS(SELECT 1 FROM public.certificates WHERE id=current_setting('test.cert_id')::uuid) THEN RAISE EXCEPTION 'Outsider can read certificate'; END IF; END; $$;
SELECT set_config('request.jwt.claim.sub',current_setting('test.cert_owner'),true);
DO $trainer$
DECLARE report jsonb; denied boolean:=false;
BEGIN
  BEGIN UPDATE public.studio_lessons SET body='A published lesson must remain locked' WHERE id=current_setting('test.cert_reading')::uuid; EXCEPTION WHEN raise_exception THEN denied:=true; END;
  IF NOT denied THEN RAISE EXCEPTION 'Published course write guard weakened'; END IF;
  report:=public.course_certificates(current_setting('test.cert_course')::uuid);
  IF (report->>'total')::integer<>1 THEN RAISE EXCEPTION 'Trainer certificate list incomplete'; END IF;
  PERFORM public.revoke_studio_certificate(current_setting('test.cert_id')::uuid,'The practical evidence was found to be invalid after review.');
  report:=public.course_gradebook(current_setting('test.cert_course')::uuid);
  IF EXISTS(SELECT 1 FROM jsonb_array_elements(report->'learners') person WHERE (person->>'certified')::boolean) THEN RAISE EXCEPTION 'Revoked certificate counts in gradebook'; END IF;
END;
$trainer$;
RESET ROLE;
DO $revoked$
DECLARE denied boolean:=false; child uuid;
BEGIN
  IF NOT EXISTS(SELECT 1 FROM public.certificates WHERE id=current_setting('test.cert_id')::uuid AND revoked_at IS NOT NULL AND revoked_by=current_setting('test.cert_owner')::uuid AND course_version=1 AND validated_at IS NOT NULL) THEN RAISE EXCEPTION 'Original validation or revocation lost'; END IF;
  BEGIN PERFORM public.issue_studio_certificate(current_setting('test.cert_learner')::uuid,current_setting('test.cert_course')::uuid,1,current_setting('test.cert_manifest')::jsonb,current_setting('test.cert_tasks')::jsonb);
    EXCEPTION WHEN raise_exception THEN denied:=SQLERRM LIKE 'This certificate was revoked%'; END;
  IF NOT denied THEN RAISE EXCEPTION 'Revoked certificate was reissued'; END IF;
  INSERT INTO public.studio_courses(author_id,title,description,prerequisite_course_id) VALUES(current_setting('test.cert_owner')::uuid,'Prerequisite fixture','Rollback-only certificate prerequisite check',current_setting('test.cert_course')::uuid) RETURNING id INTO child;
  PERFORM set_config('request.jwt.claim.sub',current_setting('test.cert_learner'),true);
  IF public.studio_prerequisite_satisfied(child) THEN RAISE EXCEPTION 'Revoked certificate satisfies prerequisite'; END IF;
END;
$revoked$;
DO $historical$
DECLARE learner_ref uuid:=gen_random_uuid(); historical_ref uuid; result jsonb;
BEGIN
  INSERT INTO public.course_enrollments(user_id,course_id,payment_status,amount_cents) VALUES(learner_ref,current_setting('test.cert_course')::uuid,'paid',2000);
  INSERT INTO public.certificates(user_id,source,course_ref,title,issued_at) VALUES(learner_ref,'studio',current_setting('test.cert_course'),'Original historical title','2025-01-01T00:00:00Z') RETURNING id INTO historical_ref;
  result:=public.issue_studio_certificate(learner_ref,current_setting('test.cert_course')::uuid,1,current_setting('test.cert_manifest')::jsonb,current_setting('test.cert_tasks')::jsonb);
  IF (result->>'id')::uuid<>historical_ref OR result->>'title'<>'Original historical title' THEN RAISE EXCEPTION 'Historical record was replaced'; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.certificates WHERE id=historical_ref AND validated_at IS NULL AND course_version IS NULL AND issued_at='2025-01-01T00:00:00Z') THEN RAISE EXCEPTION 'Historical record was silently revalidated'; END IF;
  PERFORM set_config('request.jwt.claim.sub',current_setting('test.cert_owner'),true);
  UPDATE public.studio_courses SET published=false WHERE id=current_setting('test.cert_course')::uuid;
  UPDATE public.studio_courses SET title='Updated course title',version_number=2 WHERE id=current_setting('test.cert_course')::uuid;
  IF NOT EXISTS(SELECT 1 FROM public.certificates WHERE id=current_setting('test.cert_id')::uuid AND course_version=1 AND title='Rollback-only certificate fixture' AND revoked_at IS NOT NULL) THEN RAISE EXCEPTION 'Course edits rewrote issued certificate'; END IF;
END;
$historical$;
ROLLBACK;
