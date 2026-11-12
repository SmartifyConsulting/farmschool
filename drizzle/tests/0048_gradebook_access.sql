BEGIN;

DO $fixture$
DECLARE owner_ref uuid; course_ref uuid; reading_ref uuid; quiz_ref uuid; competency_ref uuid; cohort_ref uuid; learner_ref uuid:=gen_random_uuid(); unstarted_ref uuid:=gen_random_uuid(); retired_ref uuid:=gen_random_uuid();
BEGIN
  SELECT user_id INTO owner_ref FROM public.user_roles WHERE role='admin' LIMIT 1;
  IF owner_ref IS NULL THEN RAISE EXCEPTION 'Fixture owner required'; END IF;
  PERFORM set_config('request.jwt.claim.sub',owner_ref::text,true);
  INSERT INTO public.studio_courses(author_id,title,description) VALUES(owner_ref,'Rollback-only gradebook verification','Temporary gradebook assessment fixture') RETURNING id INTO course_ref;
  INSERT INTO public.studio_lessons(course_id,title,kind,body,position) VALUES(course_ref,'Reading','reading','Practical course notes',0) RETURNING id INTO reading_ref;
  INSERT INTO public.studio_lessons(course_id,title,kind,body,position) VALUES(course_ref,'Quiz','quiz','',1) RETURNING id INTO quiz_ref;
  INSERT INTO public.cohorts(name,owner_id) VALUES('Rollback-only gradebook group',owner_ref) RETURNING id INTO cohort_ref;
  INSERT INTO public.cohort_members(cohort_id,user_id) VALUES(cohort_ref,learner_ref),(cohort_ref,unstarted_ref);
  INSERT INTO public.cohort_course_assignments(cohort_id,course_id) VALUES(cohort_ref,course_ref);
  INSERT INTO public.course_enrollments(user_id,course_id,payment_status) VALUES(retired_ref,course_ref,'refunded');
  INSERT INTO public.lesson_progress(user_id,course_id,lesson_id,completed,position_seconds) VALUES(learner_ref,course_ref::text,reading_ref::text,true,0);
  INSERT INTO public.quiz_attempts(user_id,course_id,lesson_id,score,passed,created_at) VALUES(learner_ref,course_ref::text,quiz_ref::text,80,true,'2026-11-01T10:00:00Z'),(learner_ref,course_ref::text,quiz_ref::text,0,false,'2026-11-02T10:00:00Z');
  competency_ref:=public.add_course_competency(course_ref,'SAFE-01','Practical technique','Verified trainer observations');
  INSERT INTO public.learner_competency_evidence(user_id,competency_id,source_type,source_id,score,achieved,assessed_by,assessed_at) VALUES(learner_ref,competency_ref,'trainer',gen_random_uuid()::text,40,false,owner_ref,'2026-11-01T10:00:00Z'),(learner_ref,competency_ref,'trainer',gen_random_uuid()::text,90,true,owner_ref,'2026-11-02T10:00:00Z');
  INSERT INTO public.competency_submissions(competency_id,user_id,attempt,body,competency_title,instructions,criteria_snapshot,pass_mark,rubric_version) VALUES(competency_ref,learner_ref,1,'Pending written evidence for the practical technique.','Practical technique','Provide evidence','[]',80,1);
  INSERT INTO public.certificates(user_id,source,course_ref,title) VALUES(learner_ref,'studio',course_ref::text,'Gradebook fixture certificate');
  PERFORM set_config('test.book_owner',owner_ref::text,true);
  PERFORM set_config('test.book_course',course_ref::text,true);
  PERFORM set_config('test.book_learner',learner_ref::text,true);
  PERFORM set_config('test.book_unstarted',unstarted_ref::text,true);
  PERFORM set_config('test.book_quiz',quiz_ref::text,true);
  PERFORM set_config('test.book_competency',competency_ref::text,true);
END;
$fixture$;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub',current_setting('test.book_owner'),true);
DO $author$
DECLARE report jsonb; learner jsonb; unstarted jsonb; first_page jsonb; second_page jsonb; denied boolean:=false;
BEGIN
  report:=public.course_gradebook(current_setting('test.book_course')::uuid,0,50);
  IF (report->>'total')::integer<>3 OR jsonb_array_length(report->'learners')<>3 THEN RAISE EXCEPTION 'Learner population incomplete'; END IF;
  SELECT value INTO learner FROM jsonb_array_elements(report->'learners') WHERE value->>'userId'=current_setting('test.book_learner');
  SELECT value INTO unstarted FROM jsonb_array_elements(report->'learners') WHERE value->>'userId'=current_setting('test.book_unstarted');
  IF jsonb_array_length(learner->'completedLessons')<>1 OR jsonb_array_length(unstarted->'completedLessons')<>0 THEN RAISE EXCEPTION 'Progress report incorrect'; END IF;
  IF (learner->'quizScores'->current_setting('test.book_quiz')->>'score')::numeric<>0 OR (learner->'quizScores'->current_setting('test.book_quiz')->>'attempts')::integer<>2 THEN RAISE EXCEPTION 'Latest quiz score or zero grade lost'; END IF;
  IF (learner->'competencyScores'->current_setting('test.book_competency')->>'score')::numeric<>90 OR (learner->>'pendingSubmissions')::integer<>1 OR NOT (learner->>'certified')::boolean THEN RAISE EXCEPTION 'Assessment and pending work report incorrect'; END IF;
  IF unstarted->'quizScores'<>'{}'::jsonb OR unstarted->'competencyScores'<>'{}'::jsonb THEN RAISE EXCEPTION 'Missing grades were fabricated'; END IF;
  first_page:=public.course_gradebook(current_setting('test.book_course')::uuid,0,1);
  second_page:=public.course_gradebook(current_setting('test.book_course')::uuid,1,1);
  IF jsonb_array_length(first_page->'learners')<>1 OR first_page->'learners'->0->>'userId'=second_page->'learners'->0->>'userId' THEN RAISE EXCEPTION 'Pagination duplicated or lost learners'; END IF;
  BEGIN
    PERFORM public.course_gradebook(current_setting('test.book_course')::uuid,0,10000);
  EXCEPTION WHEN raise_exception THEN denied:=true;
  END;
  IF NOT denied THEN RAISE EXCEPTION 'Oversized page accepted'; END IF;
END;
$author$;
SELECT set_config('request.jwt.claim.sub',current_setting('test.book_learner'),true);
DO $learner$
DECLARE denied boolean:=false;
BEGIN
  BEGIN
    PERFORM public.course_gradebook(current_setting('test.book_course')::uuid);
  EXCEPTION WHEN raise_exception THEN denied:=true;
  END;
  IF NOT denied THEN RAISE EXCEPTION 'Learner can read private course gradebook'; END IF;
END;
$learner$;
SELECT set_config('request.jwt.claim.sub',gen_random_uuid()::text,true);
DO $outsider$
DECLARE denied boolean:=false;
BEGIN
  BEGIN
    PERFORM public.course_gradebook(current_setting('test.book_course')::uuid);
  EXCEPTION WHEN raise_exception THEN denied:=true;
  END;
  IF NOT denied THEN RAISE EXCEPTION 'Unrelated author can read gradebook'; END IF;
  IF has_function_privilege('anon','public.course_gradebook(uuid,integer,integer)','EXECUTE') THEN RAISE EXCEPTION 'Anonymous gradebook access granted'; END IF;
END;
$outsider$;
RESET ROLE;

ROLLBACK;
