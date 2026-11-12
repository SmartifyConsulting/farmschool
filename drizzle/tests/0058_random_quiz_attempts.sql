BEGIN;
DO $fixture$
DECLARE owner_ref uuid; learner_ref uuid:=gen_random_uuid(); course_ref uuid; lesson_ref uuid; pool jsonb:='[{"kind":"boolean","q":"Question A"},{"kind":"boolean","q":"Question B"},{"kind":"boolean","q":"Question C"}]';
BEGIN
  SELECT user_id INTO owner_ref FROM public.user_roles WHERE role='admin' LIMIT 1;
  IF owner_ref IS NULL THEN RAISE EXCEPTION 'Fixture owner required'; END IF;
  PERFORM set_config('request.jwt.claim.sub',owner_ref::text,true);
  INSERT INTO public.studio_courses(author_id,title,description,price_cents) VALUES(owner_ref,'Rollback-only random exam','Verified random selection and immutable quiz attempt grading.',2000) RETURNING id INTO course_ref;
  INSERT INTO public.studio_lessons(course_id,title,kind,body) VALUES(course_ref,'Random quiz','quiz','') RETURNING id INTO lesson_ref;
  PERFORM public.studio_save_quiz_pool(lesson_ref,'Random quiz',50,pool,'[0,1,0]',2);
  PERFORM public.studio_approve_review(course_ref); PERFORM public.studio_publish_version(course_ref,'Rollback-only random quiz test');
  INSERT INTO public.course_enrollments(user_id,course_id,payment_status,amount_cents) VALUES(learner_ref,course_ref,'paid',2000);
  PERFORM set_config('test.exam_owner',owner_ref::text,true); PERFORM set_config('test.exam_learner',learner_ref::text,true); PERFORM set_config('test.exam_course',course_ref::text,true); PERFORM set_config('test.exam_lesson',lesson_ref::text,true);
  PERFORM set_config('test.exam_pool',pool::text,true); PERFORM set_config('test.exam_source_body',E'pass:50\nsample:2',true); PERFORM set_config('test.exam_source_keys','[0,1,0]',true);
END;
$fixture$;
SET LOCAL ROLE service_role;
DO $start$
DECLARE prepared jsonb; reserved jsonb; denied boolean:=false; old_lease uuid;
BEGIN
  BEGIN PERFORM public.start_quiz_exam(current_setting('test.exam_learner')::uuid,current_setting('test.exam_lesson')::uuid,current_setting('test.exam_source_body'),current_setting('test.exam_pool')::jsonb,current_setting('test.exam_source_keys')::jsonb,ARRAY[0,0]); EXCEPTION WHEN raise_exception THEN denied:=true; END;
  IF NOT denied THEN RAISE EXCEPTION 'Duplicate question indices accepted'; END IF;
  prepared:=public.start_quiz_exam(current_setting('test.exam_learner')::uuid,current_setting('test.exam_lesson')::uuid,current_setting('test.exam_source_body'),current_setting('test.exam_pool')::jsonb,current_setting('test.exam_source_keys')::jsonb,ARRAY[0,1]);
  IF prepared ? 'answers' OR jsonb_array_length(prepared->'questions')<>2 THEN RAISE EXCEPTION 'Preparation leaked keys or wrong count'; END IF;
  PERFORM set_config('test.exam_session',prepared->>'attemptId',true);
  denied:=false;
  BEGIN PERFORM public.reserve_quiz_exam((prepared->>'attemptId')::uuid,gen_random_uuid(),current_setting('test.exam_lesson')::uuid); EXCEPTION WHEN raise_exception THEN denied:=true; END;
  IF NOT denied THEN RAISE EXCEPTION 'Another learner reserved this attempt'; END IF;
  reserved:=public.reserve_quiz_exam((prepared->>'attemptId')::uuid,current_setting('test.exam_learner')::uuid,current_setting('test.exam_lesson')::uuid);
  IF reserved->'answers'<>'[0,1]'::jsonb OR (reserved->>'passMark')::integer<>50 THEN RAISE EXCEPTION 'Snapshot keys do not match selected questions'; END IF;
  old_lease:=(reserved->>'lease')::uuid;
  denied:=false;
  BEGIN PERFORM public.reserve_quiz_exam((prepared->>'attemptId')::uuid,current_setting('test.exam_learner')::uuid,current_setting('test.exam_lesson')::uuid); EXCEPTION WHEN raise_exception THEN denied:=true; END;
  IF NOT denied THEN RAISE EXCEPTION 'Two active graders reserved same attempt'; END IF;
  PERFORM public.release_quiz_exam((prepared->>'attemptId')::uuid,old_lease);
  reserved:=public.reserve_quiz_exam((prepared->>'attemptId')::uuid,current_setting('test.exam_learner')::uuid,current_setting('test.exam_lesson')::uuid);
  PERFORM set_config('test.exam_lease',reserved->>'lease',true);
  denied:=false;
  BEGIN PERFORM public.finish_quiz_exam((prepared->>'attemptId')::uuid,current_setting('test.exam_learner')::uuid,old_lease,'[true,false]','[null,null]'); EXCEPTION WHEN raise_exception THEN denied:=true; END;
  IF NOT denied THEN RAISE EXCEPTION 'Old grader completed a replacement lease'; END IF;
END;
$start$;
RESET ROLE;
DO $change_source$
BEGIN
  UPDATE public.studio_courses SET published=false WHERE id=current_setting('test.exam_course')::uuid;
  PERFORM public.studio_save_quiz_pool(current_setting('test.exam_lesson')::uuid,'Changed quiz',100,current_setting('test.exam_pool')::jsonb,'[1,0,1]',1);
  PERFORM public.studio_approve_review(current_setting('test.exam_course')::uuid); PERFORM public.studio_publish_version(current_setting('test.exam_course')::uuid,'Changed after attempt started');
END;
$change_source$;
SET LOCAL ROLE service_role;
DO $finish$
DECLARE outcome jsonb; replay jsonb;
BEGIN
  outcome:=public.finish_quiz_exam(current_setting('test.exam_session')::uuid,current_setting('test.exam_learner')::uuid,current_setting('test.exam_lease')::uuid,'[true,false]','[null,null]');
  IF (outcome->>'score')::integer<>50 OR NOT (outcome->>'passed')::boolean OR (outcome->>'passMark')::integer<>50 THEN RAISE EXCEPTION 'Current source replaced original pass mark'; END IF;
  replay:=public.finish_quiz_exam(current_setting('test.exam_session')::uuid,current_setting('test.exam_learner')::uuid,current_setting('test.exam_lease')::uuid,'[true,true]','[null,null]');
  IF replay IS DISTINCT FROM outcome THEN RAISE EXCEPTION 'Retry rewrote recorded result'; END IF;
  IF (SELECT count(*) FROM public.quiz_attempts WHERE user_id=current_setting('test.exam_learner')::uuid AND lesson_id=current_setting('test.exam_lesson'))<>1 THEN RAISE EXCEPTION 'Quiz recorded more than once'; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.lesson_progress WHERE user_id=current_setting('test.exam_learner')::uuid AND lesson_id=current_setting('test.exam_lesson') AND completed) THEN RAISE EXCEPTION 'Passed attempt did not update progress atomically'; END IF;
END;
$finish$;
RESET ROLE;
UPDATE public.course_enrollments SET payment_status='refunded' WHERE course_id=current_setting('test.exam_course')::uuid;
SET LOCAL ROLE service_role;
DO $refund$
DECLARE denied boolean:=false;
BEGIN
  BEGIN PERFORM public.start_quiz_exam(current_setting('test.exam_learner')::uuid,current_setting('test.exam_lesson')::uuid,E'pass:100\nsample:1',current_setting('test.exam_pool')::jsonb,'[1,0,1]',ARRAY[0]); EXCEPTION WHEN raise_exception THEN denied:=SQLERRM LIKE 'This course is not available%'; END;
  IF NOT denied THEN RAISE EXCEPTION 'Refunded learner started paid exam'; END IF;
END;
$refund$;
RESET ROLE;
UPDATE public.course_enrollments SET payment_status='paid' WHERE course_id=current_setting('test.exam_course')::uuid;
SET LOCAL ROLE service_role;
SELECT set_config('test.exam_expired',(public.start_quiz_exam(current_setting('test.exam_learner')::uuid,current_setting('test.exam_lesson')::uuid,E'pass:100\nsample:1',current_setting('test.exam_pool')::jsonb,'[1,0,1]',ARRAY[0])->>'attemptId'),true);
RESET ROLE;
UPDATE public.quiz_exam_sessions SET expires_at=now()-interval '1 minute' WHERE id=current_setting('test.exam_expired')::uuid;
SET LOCAL ROLE service_role;
DO $expired$
DECLARE denied boolean:=false;
BEGIN
  BEGIN PERFORM public.reserve_quiz_exam(current_setting('test.exam_expired')::uuid,current_setting('test.exam_learner')::uuid,current_setting('test.exam_lesson')::uuid); EXCEPTION WHEN raise_exception THEN denied:=SQLERRM LIKE '%attempt expired%'; END;
  IF NOT denied THEN RAISE EXCEPTION 'Expired attempt can be graded'; END IF;
END;
$expired$;
RESET ROLE;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub',current_setting('test.exam_learner'),true);
DO $private$
DECLARE denied boolean:=false;
BEGIN
  BEGIN PERFORM answers FROM public.quiz_exam_sessions; EXCEPTION WHEN insufficient_privilege THEN denied:=true; END;
  IF NOT denied THEN RAISE EXCEPTION 'Learner can read session answer keys'; END IF;
  denied:=false;
  BEGIN PERFORM public.reserve_quiz_exam(current_setting('test.exam_session')::uuid,auth.uid(),current_setting('test.exam_lesson')::uuid); EXCEPTION WHEN insufficient_privilege THEN denied:=true; END;
  IF NOT denied THEN RAISE EXCEPTION 'Learner can invoke private grading reservations'; END IF;
END;
$private$;
RESET ROLE;
DO $quota$
DECLARE person uuid:=gen_random_uuid(); i integer; denied boolean:=false;
BEGIN
  INSERT INTO public.course_enrollments(user_id,course_id,payment_status,amount_cents) VALUES(person,current_setting('test.exam_course')::uuid,'paid',2000);
  FOR i IN 1..50 LOOP PERFORM public.start_quiz_exam(person,current_setting('test.exam_lesson')::uuid,E'pass:100\nsample:1',current_setting('test.exam_pool')::jsonb,'[1,0,1]',ARRAY[0]); END LOOP;
  BEGIN PERFORM public.start_quiz_exam(person,current_setting('test.exam_lesson')::uuid,E'pass:100\nsample:1',current_setting('test.exam_pool')::jsonb,'[1,0,1]',ARRAY[0]); EXCEPTION WHEN raise_exception THEN denied:=SQLERRM LIKE '%daily limit%'; END;
  IF NOT denied THEN RAISE EXCEPTION 'Random attempt quota not enforced'; END IF;
END;
$quota$;
ROLLBACK;
