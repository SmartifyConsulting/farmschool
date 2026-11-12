BEGIN;
DO $fixture$
DECLARE owner_ref uuid; learner_ref uuid:=gen_random_uuid(); other_ref uuid:=gen_random_uuid(); course_ref uuid; lesson_ref uuid;
BEGIN
  SELECT user_id INTO owner_ref FROM public.user_roles WHERE role='admin' LIMIT 1;
  INSERT INTO auth.users(id,aud,role,email,created_at,updated_at) VALUES(learner_ref,'authenticated','authenticated','controlled-learner-'||learner_ref||'@example.invalid',now(),now()),(other_ref,'authenticated','authenticated','controlled-other-'||other_ref||'@example.invalid',now(),now());
  PERFORM set_config('request.jwt.claim.sub',owner_ref::text,true);
  INSERT INTO public.studio_courses(author_id,title,description,price_cents) VALUES(owner_ref,'Controlled exam training','Exam timing, retry, recovery and renewal lifecycle fixture',2000) RETURNING id INTO course_ref;
  INSERT INTO public.studio_lessons(course_id,title,kind,body,position) VALUES(course_ref,'Controlled exam','quiz','',0) RETURNING id INTO lesson_ref;
  PERFORM public.studio_save_quiz_pool(lesson_ref,'Controlled exam',80,'[{"kind":"boolean","q":"Original A"},{"kind":"boolean","q":"Original B"}]','[0,1]',2);
  PERFORM public.save_quiz_exam_policy(lesson_ref,2,10,30,0);
  PERFORM public.studio_approve_review(course_ref); PERFORM public.studio_publish_version(course_ref,'Exam controls fixture');
  INSERT INTO public.course_enrollments(user_id,course_id,payment_status,amount_cents) VALUES(learner_ref,course_ref,'paid',2000);
  PERFORM set_config('test.control_owner',owner_ref::text,true); PERFORM set_config('test.control_learner',learner_ref::text,true); PERFORM set_config('test.control_other',other_ref::text,true);
  PERFORM set_config('test.control_course',course_ref::text,true); PERFORM set_config('test.control_lesson',lesson_ref::text,true); PERFORM set_config('test.control_request',gen_random_uuid()::text,true);
END;
$fixture$;
SET LOCAL ROLE service_role;
DO $recovery$
DECLARE l public.studio_lessons; first_start jsonb; retry jsonb; resumed jsonb; denied boolean:=false; draft_version integer;
BEGIN
  SELECT * INTO l FROM public.studio_lessons WHERE id=current_setting('test.control_lesson')::uuid;
  first_start:=public.start_quiz_exam(current_setting('test.control_learner')::uuid,l.id,l.body,l.quiz,'[0,1]',ARRAY[1,0],false,current_setting('test.control_request')::uuid);
  retry:=public.start_quiz_exam(current_setting('test.control_learner')::uuid,l.id,l.body,l.quiz,'[0,1]',ARRAY[0,1],false,current_setting('test.control_request')::uuid);
  IF first_start->>'attemptId'<>retry->>'attemptId' OR (retry->>'attemptsUsed')::integer<>1 OR (first_start->>'durationMinutes')::integer<>10 THEN RAISE EXCEPTION 'Start retry consumed another attempt or lost timer'; END IF;
  PERFORM set_config('test.control_first',first_start->>'attemptId',true);
  draft_version:=public.save_quiz_exam_answers((first_start->>'attemptId')::uuid,current_setting('test.control_learner')::uuid,'[1,null]',0);
  IF draft_version<>1 OR public.save_quiz_exam_answers((first_start->>'attemptId')::uuid,current_setting('test.control_learner')::uuid,'[1,null]',0)<>1 THEN RAISE EXCEPTION 'Draft retry is not idempotent'; END IF;
  BEGIN PERFORM public.save_quiz_exam_answers((first_start->>'attemptId')::uuid,current_setting('test.control_learner')::uuid,'[0,null]',0); EXCEPTION WHEN raise_exception THEN denied:=SQLERRM LIKE 'Answers changed%'; END;
  IF NOT denied THEN RAISE EXCEPTION 'Stale answer update overwrote another tab'; END IF;
  resumed:=public.start_quiz_exam(current_setting('test.control_learner')::uuid,l.id,l.body,l.quiz,'[0,1]',ARRAY[0,1],false,gen_random_uuid());
  IF resumed->>'attemptId'<>first_start->>'attemptId' OR resumed->'draftAnswers'<>'[1,null]'::jsonb OR NOT (resumed->>'resumed')::boolean OR resumed ? 'answers' THEN RAISE EXCEPTION 'Resume lost private snapshot/draft or exposed keys'; END IF;
  denied:=false; BEGIN PERFORM public.start_quiz_exam(current_setting('test.control_learner')::uuid,l.id,l.body,l.quiz,'[0,1]',ARRAY[0,1],true,gen_random_uuid()); EXCEPTION WHEN raise_exception THEN denied:=SQLERRM LIKE 'The minimum time%'; END;
  IF NOT denied THEN RAISE EXCEPTION 'Minimum start spacing bypassed'; END IF;
END;
$recovery$;
RESET ROLE;
SELECT set_config('request.jwt.claim.sub',current_setting('test.control_owner'),true);
DO $changes$
DECLARE denied boolean:=false; l public.studio_lessons; archive jsonb; restored uuid; copied uuid;
BEGIN
  UPDATE public.studio_courses SET published=false WHERE id=current_setting('test.control_course')::uuid;
  BEGIN PERFORM public.save_quiz_exam_policy(current_setting('test.control_lesson')::uuid,2,1,0,0); EXCEPTION WHEN raise_exception THEN denied:=SQLERRM LIKE 'Exam controls changed%'; END;
  IF NOT denied THEN RAISE EXCEPTION 'Stale policy overwrite accepted'; END IF;
  PERFORM public.save_quiz_exam_policy(current_setting('test.control_lesson')::uuid,2,1,0,1);
  PERFORM public.studio_save_quiz_pool(current_setting('test.control_lesson')::uuid,'Changed exam',80,'[{"kind":"boolean","q":"New source question"}]','[0]',1);
  archive:=public.export_course_archive(current_setting('test.control_course')::uuid);
  restored:=public.restore_course_archive(gen_random_uuid(),archive);
  copied:=public.studio_copy_draft(current_setting('test.control_course')::uuid,false);
  IF NOT EXISTS(SELECT 1 FROM public.studio_quiz_policies WHERE course_id=restored AND max_attempts=2 AND duration_minutes=1) OR NOT EXISTS(SELECT 1 FROM public.studio_quiz_policies WHERE course_id=copied AND max_attempts=2 AND duration_minutes=1) THEN RAISE EXCEPTION 'Copy/archive dropped exam controls'; END IF;
  PERFORM public.studio_approve_review(current_setting('test.control_course')::uuid); PERFORM public.studio_publish_version(current_setting('test.control_course')::uuid,'Changed exam controls');
END;
$changes$;
SET LOCAL ROLE service_role;
DO $limits$
DECLARE l public.studio_lessons; resumed jsonb; second_start jsonb; reserved jsonb; result jsonb; denied boolean:=false;
BEGIN
  SELECT * INTO l FROM public.studio_lessons WHERE id=current_setting('test.control_lesson')::uuid;
  resumed:=public.start_quiz_exam(current_setting('test.control_learner')::uuid,l.id,l.body,l.quiz,'[0]',ARRAY[0],false,gen_random_uuid());
  IF resumed->>'attemptId'<>current_setting('test.control_first') OR jsonb_array_length(resumed->'questions')<>2 OR (resumed->>'durationMinutes')::integer<>10 THEN RAISE EXCEPTION 'Source changes replaced unfinished questions or timer'; END IF;
  second_start:=public.start_quiz_exam(current_setting('test.control_learner')::uuid,l.id,l.body,l.quiz,'[0]',ARRAY[0],true,gen_random_uuid());
  PERFORM set_config('test.control_second',second_start->>'attemptId',true);
  IF (second_start->>'attemptsUsed')::integer<>2 OR (second_start->>'durationMinutes')::integer<>1 OR NOT EXISTS(SELECT 1 FROM public.quiz_exam_sessions WHERE id=current_setting('test.control_first')::uuid AND abandoned_at IS NOT NULL) THEN RAISE EXCEPTION 'Replacement did not consume an attempt and close old work'; END IF;
  BEGIN PERFORM public.reserve_quiz_exam(current_setting('test.control_first')::uuid,current_setting('test.control_learner')::uuid,l.id); EXCEPTION WHEN raise_exception THEN denied:=true; END;
  IF NOT denied THEN RAISE EXCEPTION 'Abandoned attempt can still be submitted'; END IF;
  denied:=false; BEGIN PERFORM public.start_quiz_exam(current_setting('test.control_learner')::uuid,l.id,l.body,l.quiz,'[0]',ARRAY[0],true,gen_random_uuid()); EXCEPTION WHEN raise_exception THEN denied:=SQLERRM LIKE 'Your attempt limit%'; END;
  IF NOT denied THEN RAISE EXCEPTION 'Attempt cap bypassed'; END IF;
  resumed:=public.start_quiz_exam(current_setting('test.control_learner')::uuid,l.id,l.body,l.quiz,'[0]',ARRAY[0],false,gen_random_uuid());
  IF resumed->>'attemptId'<>second_start->>'attemptId' THEN RAISE EXCEPTION 'Exhausted cap blocks resuming valid work'; END IF;
  reserved:=public.reserve_quiz_exam((second_start->>'attemptId')::uuid,current_setting('test.control_learner')::uuid,l.id,'[0]',0);
  PERFORM set_config('test.control_lease',reserved->>'lease',true);
END;
$limits$;
RESET ROLE;
UPDATE public.quiz_exam_sessions SET expires_at=clock_timestamp()-interval '1 second',grading_started_at=clock_timestamp()-interval '2 seconds' WHERE id=current_setting('test.control_second')::uuid;
SET LOCAL ROLE service_role;
DO $on_time_submission$
DECLARE result jsonb;
BEGIN
  result:=public.finish_quiz_exam(current_setting('test.control_second')::uuid,current_setting('test.control_learner')::uuid,current_setting('test.control_lease')::uuid,'[true]','[null]');
  IF NOT (result->>'passed')::boolean THEN RAISE EXCEPTION 'On-time reservation cannot finish within its grading lease'; END IF;
END;
$on_time_submission$;
RESET ROLE;
SELECT set_config('request.jwt.claim.sub',current_setting('test.control_owner'),true);
DO $renewal$
DECLARE cert_ref uuid;
BEGIN
  PERFORM public.set_course_certificate_policy(current_setting('test.control_course')::uuid,30,30,0,'Assessment control renewal regression fixture');
  INSERT INTO public.certificates(user_id,source,course_ref,title,validated_at) VALUES(current_setting('test.control_learner')::uuid,'studio',current_setting('test.control_course'),'Expired fixture certificate',clock_timestamp()-interval '31 days') RETURNING id INTO cert_ref;
  PERFORM set_config('request.jwt.claim.sub',current_setting('test.control_learner'),true);
  PERFORM public.start_certificate_renewal(cert_ref);
END;
$renewal$;
SET LOCAL ROLE service_role;
DO $new_cycle$
DECLARE l public.studio_lessons; started jsonb; denied boolean:=false;
BEGIN
  SELECT * INTO l FROM public.studio_lessons WHERE id=current_setting('test.control_lesson')::uuid;
  started:=public.start_quiz_exam(current_setting('test.control_learner')::uuid,l.id,l.body,l.quiz,'[0]',ARRAY[0],false,gen_random_uuid());
  IF (started->>'attemptsUsed')::integer<>1 OR started->>'attemptId'=current_setting('test.control_second') THEN RAISE EXCEPTION 'Renewal did not begin a fresh attempt allowance'; END IF;
  BEGIN PERFORM public.start_quiz_exam(current_setting('test.control_learner')::uuid,l.id,l.body,l.quiz,'[0]',ARRAY[0],false,current_setting('test.control_request')::uuid); EXCEPTION WHEN raise_exception THEN denied:=true; END;
  IF NOT denied THEN RAISE EXCEPTION 'Old start request crossed renewal cycle'; END IF;
END;
$new_cycle$;
RESET ROLE;
UPDATE public.course_enrollments SET payment_status='refunded' WHERE course_id=current_setting('test.control_course')::uuid;
SET LOCAL ROLE service_role;
DO $access_revoked$
DECLARE l public.studio_lessons; denied boolean:=false;
BEGIN
  SELECT * INTO l FROM public.studio_lessons WHERE id=current_setting('test.control_lesson')::uuid;
  BEGIN PERFORM public.start_quiz_exam(current_setting('test.control_learner')::uuid,l.id,l.body,l.quiz,'[0]',ARRAY[0],false,gen_random_uuid()); EXCEPTION WHEN raise_exception THEN denied:=SQLERRM LIKE 'This course is not available%'; END;
  IF NOT denied THEN RAISE EXCEPTION 'Refunded learner resumed private exam work'; END IF;
END;
$access_revoked$;
RESET ROLE;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub',current_setting('test.control_other'),true);
DO $permissions$
DECLARE denied boolean:=false;
BEGIN
  IF EXISTS(SELECT 1 FROM public.studio_quiz_policies WHERE lesson_id=current_setting('test.control_lesson')::uuid) THEN RAISE EXCEPTION 'Unenrolled learner reads paid exam controls'; END IF;
  BEGIN PERFORM public.my_quiz_exam_status(current_setting('test.control_lesson')::uuid); EXCEPTION WHEN raise_exception THEN denied:=true; END;
  IF NOT denied OR has_function_privilege('authenticated','public.save_quiz_exam_answers(uuid,uuid,jsonb,integer)','EXECUTE') OR has_function_privilege('service_role','public.quiz_exam_snapshot_start(uuid,uuid,text,jsonb,jsonb,integer[])','EXECUTE') THEN RAISE EXCEPTION 'Private exam worker privileges exposed'; END IF;
END;
$permissions$;
RESET ROLE;
ROLLBACK;
