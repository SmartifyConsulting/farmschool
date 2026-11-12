BEGIN;

CREATE FUNCTION public.studio_save_quiz_pool(_lesson_id uuid,_title text,_pass_mark integer,_questions jsonb,_answers jsonb,_sample_size integer)
RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE question_count integer; i integer;
BEGIN
  IF jsonb_typeof(_questions) IS DISTINCT FROM 'array' OR jsonb_typeof(_answers) IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'Invalid quiz pool'; END IF;
  question_count:=jsonb_array_length(_questions);
  IF _sample_size IS NOT NULL AND (_sample_size NOT BETWEEN 1 AND 50 OR _sample_size>question_count) THEN RAISE EXCEPTION 'Choose a sample size within the saved question count'; END IF;
  IF _sample_size IS NOT NULL THEN
    FOR i IN 0..question_count-1 LOOP
      IF NOT coalesce(public.question_bank_valid(_questions->i,_answers->i),false) THEN RAISE EXCEPTION 'Complete each pool question and correct answer'; END IF;
    END LOOP;
  END IF;
  PERFORM public.studio_save_quiz(_lesson_id,_title,_pass_mark,_questions,_answers);
  IF _sample_size IS NOT NULL THEN UPDATE public.studio_lessons SET body='pass:'||_pass_mark||E'\nsample:'||_sample_size WHERE id=_lesson_id; END IF;
END;
$$;
REVOKE ALL ON FUNCTION public.studio_save_quiz_pool(uuid,text,integer,jsonb,jsonb,integer) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.studio_save_quiz_pool(uuid,text,integer,jsonb,jsonb,integer) TO authenticated;

CREATE TABLE public.quiz_exam_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id uuid NOT NULL REFERENCES public.studio_courses(id) ON DELETE CASCADE,
  lesson_id uuid NOT NULL REFERENCES public.studio_lessons(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  questions jsonb NOT NULL, answers jsonb NOT NULL,
  pass_mark integer NOT NULL CHECK(pass_mark BETWEEN 1 AND 100),
  created_at timestamptz NOT NULL DEFAULT now(), expires_at timestamptz NOT NULL DEFAULT now()+interval '4 hours',
  state text NOT NULL DEFAULT 'open' CHECK(state IN('open','grading','submitted')),
  lease uuid, lease_until timestamptz, result jsonb
);
CREATE INDEX quiz_exam_user_created ON public.quiz_exam_sessions(user_id,created_at);
ALTER TABLE public.quiz_exam_sessions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.quiz_exam_sessions FROM PUBLIC,anon,authenticated;
GRANT ALL ON public.quiz_exam_sessions TO service_role;

CREATE FUNCTION public.start_quiz_exam(_user uuid,_lesson uuid,_expected_body text,_expected_quiz jsonb,_expected_answers jsonb,_selection integer[])
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE course_ref uuid; course_row public.studio_courses; lesson public.studio_lessons; keys jsonb; sample_size integer; index_value integer;
  questions jsonb:='[]'; answers jsonb:='[]'; session_row public.quiz_exam_sessions; previous_sub text:=current_setting('request.jwt.claim.sub',true);
BEGIN
  IF _user IS NULL THEN RAISE EXCEPTION 'Learner required'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('quiz-exam:'||_user,0));
  SELECT course_id INTO course_ref FROM public.studio_lessons WHERE id=_lesson AND kind='quiz';
  SELECT * INTO course_row FROM public.studio_courses WHERE id=course_ref FOR SHARE;
  IF NOT FOUND OR (NOT course_row.published AND course_row.author_id<>_user) THEN RAISE EXCEPTION 'Quiz unavailable'; END IF;
  PERFORM set_config('request.jwt.claim.sub',_user::text,true);
  IF NOT public.studio_course_visible(course_ref) THEN RAISE EXCEPTION 'This course is not available to you'; END IF;
  SELECT * INTO lesson FROM public.studio_lessons WHERE id=_lesson AND course_id=course_ref AND kind='quiz' FOR SHARE;
  SELECT a.answers INTO keys FROM public.studio_quiz_answers a WHERE a.lesson_id=_lesson AND a.course_id=course_ref FOR SHARE;
  IF lesson.body IS DISTINCT FROM _expected_body OR lesson.quiz IS DISTINCT FROM _expected_quiz OR keys IS DISTINCT FROM _expected_answers THEN RAISE EXCEPTION 'Quiz changed. Refresh before starting'; END IF;
  IF lesson.body !~ E'^pass:[0-9]{1,3}\nsample:[1-9][0-9]?$' OR jsonb_typeof(lesson.quiz) IS DISTINCT FROM 'array' OR jsonb_typeof(keys) IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'Random quiz configuration unavailable'; END IF;
  sample_size:=substring(lesson.body from E'\nsample:([0-9]+)$')::integer;
  IF sample_size NOT BETWEEN 1 AND 50 OR coalesce(array_length(_selection,1),0)<>sample_size
    OR (SELECT count(DISTINCT value) FROM unnest(_selection) value)<>sample_size THEN RAISE EXCEPTION 'Invalid random question selection'; END IF;
  IF (SELECT count(*) FROM public.quiz_exam_sessions WHERE user_id=_user AND created_at>clock_timestamp()-interval '24 hours')>=50 THEN RAISE EXCEPTION 'You have reached the daily limit for new random quiz attempts'; END IF;
  FOREACH index_value IN ARRAY _selection LOOP
    IF index_value IS NULL OR index_value<0 OR index_value>=jsonb_array_length(lesson.quiz)
      OR NOT coalesce(public.question_bank_valid(lesson.quiz->index_value,keys->index_value),false) THEN RAISE EXCEPTION 'Question pool contains an invalid question or answer'; END IF;
    questions:=questions||jsonb_build_array(lesson.quiz->index_value); answers:=answers||jsonb_build_array(keys->index_value);
  END LOOP;
  INSERT INTO public.quiz_exam_sessions(course_id,lesson_id,user_id,questions,answers,pass_mark)
    VALUES(course_ref,_lesson,_user,questions,answers,substring(lesson.body from '^pass:([0-9]+)')::integer) RETURNING * INTO session_row;
  PERFORM set_config('request.jwt.claim.sub',coalesce(previous_sub,''),true);
  RETURN jsonb_build_object('attemptId',session_row.id,'questions',questions,'expiresAt',session_row.expires_at);
END;
$$;

CREATE FUNCTION public.reserve_quiz_exam(_session uuid,_user uuid,_lesson uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE session_row public.quiz_exam_sessions;
BEGIN
  SELECT * INTO session_row FROM public.quiz_exam_sessions WHERE id=_session AND user_id=_user AND lesson_id=_lesson FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Quiz attempt not found'; END IF;
  IF session_row.state='submitted' THEN RETURN jsonb_build_object('result',session_row.result); END IF;
  IF session_row.expires_at<=clock_timestamp() THEN RAISE EXCEPTION 'This attempt expired. Start a new random attempt'; END IF;
  IF session_row.state='grading' AND session_row.lease_until>clock_timestamp() THEN RAISE EXCEPTION 'This attempt is being graded. Please wait'; END IF;
  UPDATE public.quiz_exam_sessions SET state='grading',lease=gen_random_uuid(),lease_until=clock_timestamp()+interval '5 minutes' WHERE id=_session RETURNING * INTO session_row;
  RETURN jsonb_build_object('lease',session_row.lease,'questions',session_row.questions,'answers',session_row.answers,'passMark',session_row.pass_mark);
END;
$$;
CREATE FUNCTION public.release_quiz_exam(_session uuid,_lease uuid)
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path='' AS $$
  UPDATE public.quiz_exam_sessions SET state='open',lease=NULL,lease_until=NULL WHERE id=_session AND lease=_lease AND state='grading'
$$;
CREATE FUNCTION public.finish_quiz_exam(_session uuid,_user uuid,_lease uuid,_correct jsonb,_feedback jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE session_row public.quiz_exam_sessions; course_ref uuid; score integer; passed boolean; outcome jsonb; previous_sub text:=current_setting('request.jwt.claim.sub',true);
BEGIN
  SELECT course_id INTO course_ref FROM public.quiz_exam_sessions WHERE id=_session AND user_id=_user;
  IF NOT FOUND THEN RAISE EXCEPTION 'Quiz attempt not found'; END IF;
  PERFORM 1 FROM public.studio_courses WHERE id=course_ref FOR SHARE;
  SELECT * INTO session_row FROM public.quiz_exam_sessions WHERE id=_session AND user_id=_user FOR UPDATE;
  PERFORM set_config('request.jwt.claim.sub',_user::text,true);
  IF NOT public.studio_course_visible(course_ref) THEN RAISE EXCEPTION 'This course is not available to you'; END IF;
  IF session_row.state='submitted' THEN
    PERFORM set_config('request.jwt.claim.sub',coalesce(previous_sub,''),true); RETURN session_row.result;
  END IF;
  IF session_row.state<>'grading' OR session_row.lease IS DISTINCT FROM _lease OR session_row.lease_until<=clock_timestamp() OR session_row.expires_at<=clock_timestamp() THEN RAISE EXCEPTION 'Attempt changed or expired. Start a new attempt'; END IF;
  IF jsonb_typeof(_correct) IS DISTINCT FROM 'array' OR jsonb_typeof(_feedback) IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'Incomplete grading result'; END IF;
  IF jsonb_array_length(_correct)<>jsonb_array_length(session_row.questions) OR jsonb_array_length(_feedback)<>jsonb_array_length(_correct)
    OR EXISTS(SELECT 1 FROM jsonb_array_elements(_correct) item WHERE jsonb_typeof(item)<>'boolean')
    OR EXISTS(SELECT 1 FROM jsonb_array_elements(_feedback) item WHERE jsonb_typeof(item) NOT IN('null','string') OR char_length(item #>> '{}')>2000) THEN RAISE EXCEPTION 'Incomplete grading result'; END IF;
  SELECT round(100.0*count(*) FILTER(WHERE value='true'::jsonb)/jsonb_array_length(_correct))::integer INTO score FROM jsonb_array_elements(_correct);
  passed:=score>=session_row.pass_mark;
  outcome:=jsonb_build_object('score',score,'passed',passed,'passMark',session_row.pass_mark,'correct',_correct,'feedback',_feedback);
  INSERT INTO public.quiz_attempts(user_id,course_id,lesson_id,score,passed) VALUES(_user,course_ref::text,session_row.lesson_id::text,score,passed);
  IF passed THEN INSERT INTO public.lesson_progress(user_id,course_id,lesson_id,completed,position_seconds,updated_at)
    VALUES(_user,course_ref::text,session_row.lesson_id::text,true,0,clock_timestamp())
    ON CONFLICT(user_id,course_id,lesson_id) DO UPDATE SET completed=true,updated_at=excluded.updated_at; END IF;
  UPDATE public.quiz_exam_sessions SET state='submitted',result=outcome,lease=NULL,lease_until=NULL WHERE id=_session;
  PERFORM set_config('request.jwt.claim.sub',coalesce(previous_sub,''),true);
  RETURN outcome;
END;
$$;
REVOKE ALL ON FUNCTION public.start_quiz_exam(uuid,uuid,text,jsonb,jsonb,integer[]),public.reserve_quiz_exam(uuid,uuid,uuid),public.release_quiz_exam(uuid,uuid),public.finish_quiz_exam(uuid,uuid,uuid,jsonb,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.start_quiz_exam(uuid,uuid,text,jsonb,jsonb,integer[]),public.reserve_quiz_exam(uuid,uuid,uuid),public.release_quiz_exam(uuid,uuid),public.finish_quiz_exam(uuid,uuid,uuid,jsonb,jsonb) TO service_role;

COMMIT;
