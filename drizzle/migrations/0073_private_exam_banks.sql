BEGIN;
CREATE TABLE public.studio_exam_banks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), owner_id uuid NOT NULL,
  questions jsonb NOT NULL, answers jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  CHECK(jsonb_typeof(questions)='array' AND jsonb_typeof(answers)='array' AND jsonb_array_length(questions) BETWEEN 1 AND 50 AND jsonb_array_length(questions)=jsonb_array_length(answers)),
  CHECK(octet_length(questions::text)+octet_length(answers::text)<=200000)
);
CREATE INDEX studio_exam_banks_owner ON public.studio_exam_banks(owner_id);
ALTER TABLE public.studio_exam_banks ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.studio_exam_banks FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.studio_exam_banks TO authenticated;
GRANT SELECT ON public.studio_exam_banks TO service_role;
CREATE POLICY private_exam_owner_read ON public.studio_exam_banks FOR SELECT TO authenticated USING(owner_id=auth.uid());
CREATE FUNCTION public.private_quiz_bank_id(_body text)
RETURNS uuid LANGUAGE sql IMMUTABLE SET search_path='' AS $$
  SELECT substring(_body FROM E'^pass:[0-9]{1,3}\nsample:[1-9][0-9]?\nbank:([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$')::uuid
$$;
CREATE FUNCTION public.studio_save_private_quiz(_lesson uuid,_title text,_pass_mark integer,_questions jsonb,_answers jsonb,_sample_size integer)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE course_ref uuid; bank_ref uuid;
BEGIN
  SELECT c.id INTO course_ref FROM public.studio_courses c JOIN public.studio_lessons l ON l.course_id=c.id WHERE l.id=_lesson AND l.kind='quiz' AND c.author_id=auth.uid() AND NOT c.published FOR UPDATE OF c;
  IF course_ref IS NULL OR auth.uid() IS NULL THEN RAISE EXCEPTION 'Only the owner can save a private exam in a draft course'; END IF;
  IF _title IS NULL OR char_length(btrim(_title)) NOT BETWEEN 1 AND 120 OR _pass_mark IS NULL OR _pass_mark NOT IN(50,60,70,75,80,90,100)
    OR jsonb_typeof(_questions) IS DISTINCT FROM 'array' OR jsonb_typeof(_answers) IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'Complete the private exam settings'; END IF;
  IF jsonb_array_length(_questions) NOT BETWEEN 1 AND 50 OR jsonb_array_length(_questions)<>jsonb_array_length(_answers)
    OR _sample_size IS NULL OR _sample_size NOT BETWEEN 1 AND jsonb_array_length(_questions) OR octet_length(_questions::text)+octet_length(_answers::text)>200000 THEN RAISE EXCEPTION 'Choose a valid question pool and sample size'; END IF;
  FOR i IN 0..jsonb_array_length(_questions)-1 LOOP
    IF NOT coalesce(public.question_bank_valid(_questions->i,_answers->i),false) THEN RAISE EXCEPTION 'Complete every private question and answer'; END IF;
  END LOOP;
  PERFORM pg_advisory_xact_lock(hashtextextended('private-exam-author:'||auth.uid(),0));
  IF (SELECT count(*) FROM public.studio_exam_banks WHERE owner_id=auth.uid())>=10000 THEN RAISE EXCEPTION 'Private exam version storage is full. Contact support'; END IF;
  INSERT INTO public.studio_exam_banks(owner_id,questions,answers) VALUES(auth.uid(),_questions,_answers) RETURNING id INTO bank_ref;
  UPDATE public.studio_lessons SET title=btrim(_title),body='pass:'||_pass_mark||E'\nsample:'||_sample_size||E'\nbank:'||bank_ref,
    quiz='[{"kind":"boolean","q":"Questions are selected when you start an attempt."}]'::jsonb WHERE id=_lesson;
  INSERT INTO public.studio_quiz_answers(lesson_id,course_id,answers) VALUES(_lesson,course_ref,'[0]'::jsonb) ON CONFLICT(lesson_id) DO UPDATE SET answers=excluded.answers;
  RETURN bank_ref;
END;
$$;
REVOKE ALL ON FUNCTION public.studio_save_private_quiz(uuid,text,integer,jsonb,jsonb,integer) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.studio_save_private_quiz(uuid,text,integer,jsonb,jsonb,integer) TO authenticated;

CREATE FUNCTION public.studio_private_exam_publish_guard()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE lesson record; bank public.studio_exam_banks; sample integer;
BEGIN
  IF NEW.published AND (NOT OLD.published OR NEW.author_id IS DISTINCT FROM OLD.author_id) THEN
    FOR lesson IN SELECT * FROM public.studio_lessons WHERE course_id=NEW.id AND kind='quiz' AND body LIKE '%bank:%' LOOP
      SELECT * INTO bank FROM public.studio_exam_banks WHERE id=public.private_quiz_bank_id(lesson.body) AND owner_id=NEW.author_id;
      sample:=substring(lesson.body FROM E'\nsample:([0-9]+)\nbank:')::integer;
      IF NOT FOUND OR sample IS NULL OR sample NOT BETWEEN 1 AND jsonb_array_length(bank.questions)
        OR substring(lesson.body FROM '^pass:([0-9]+)')::integer NOT IN(50,60,70,75,80,90,100)
        OR lesson.quiz IS DISTINCT FROM '[{"kind":"boolean","q":"Questions are selected when you start an attempt."}]'::jsonb
        OR NOT EXISTS(SELECT 1 FROM public.studio_quiz_answers WHERE lesson_id=lesson.id AND course_id=NEW.id AND answers='[0]'::jsonb) THEN RAISE EXCEPTION 'A private exam bank is missing or incompatible. Save the exam again before publishing'; END IF;
    END LOOP;
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.studio_private_exam_publish_guard() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER studio_private_exam_publish_guard BEFORE UPDATE ON public.studio_courses FOR EACH ROW EXECUTE FUNCTION public.studio_private_exam_publish_guard();

CREATE OR REPLACE FUNCTION public.start_quiz_exam(_user uuid,_lesson uuid,_expected_body text,_expected_quiz jsonb,_expected_answers jsonb,_selection integer[])
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE course_ref uuid; course_row public.studio_courses; lesson public.studio_lessons; keys jsonb; pool jsonb; bank_ref uuid; sample_size integer; index_value integer;
  questions jsonb:='[]'; answers jsonb:='[]'; session_row public.quiz_exam_sessions; previous_sub text:=current_setting('request.jwt.claim.sub',true);
BEGIN
  IF _user IS NULL THEN RAISE EXCEPTION 'Learner required'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('quiz-exam:'||_user,0));
  SELECT course_id INTO course_ref FROM public.studio_lessons WHERE id=_lesson AND kind='quiz';
  SELECT * INTO course_row FROM public.studio_courses WHERE id=course_ref FOR SHARE;
  IF NOT FOUND OR (NOT course_row.published AND course_row.author_id<>_user) THEN RAISE EXCEPTION 'Quiz unavailable'; END IF;
  PERFORM public.lock_course_license_access(course_ref,_user); PERFORM set_config('request.jwt.claim.sub',_user::text,true);
  IF NOT public.studio_course_visible(course_ref) THEN RAISE EXCEPTION 'This course is not available to you'; END IF;
  SELECT * INTO lesson FROM public.studio_lessons WHERE id=_lesson AND course_id=course_ref AND kind='quiz' FOR SHARE;
  SELECT a.answers INTO keys FROM public.studio_quiz_answers a WHERE a.lesson_id=_lesson AND a.course_id=course_ref FOR SHARE;
  IF lesson.body IS DISTINCT FROM _expected_body OR lesson.quiz IS DISTINCT FROM _expected_quiz OR keys IS DISTINCT FROM _expected_answers THEN RAISE EXCEPTION 'Quiz changed. Refresh before starting'; END IF;
  bank_ref:=public.private_quiz_bank_id(lesson.body);
  IF bank_ref IS NOT NULL THEN
    SELECT b.questions,b.answers INTO pool,keys FROM public.studio_exam_banks b WHERE b.id=bank_ref AND b.owner_id=course_row.author_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'Private exam bank unavailable'; END IF;
    sample_size:=substring(lesson.body FROM E'\nsample:([0-9]+)\nbank:')::integer;
  ELSE
    IF lesson.body !~ E'^pass:[0-9]{1,3}\nsample:[1-9][0-9]?$' THEN RAISE EXCEPTION 'Random quiz configuration unavailable'; END IF;
    pool:=lesson.quiz; sample_size:=substring(lesson.body FROM E'\nsample:([0-9]+)$')::integer;
  END IF;
  IF jsonb_typeof(pool) IS DISTINCT FROM 'array' OR jsonb_typeof(keys) IS DISTINCT FROM 'array' OR sample_size NOT BETWEEN 1 AND 50 OR sample_size>jsonb_array_length(pool)
    OR coalesce(array_length(_selection,1),0)<>sample_size OR (SELECT count(DISTINCT value) FROM unnest(_selection) value)<>sample_size THEN RAISE EXCEPTION 'Invalid random question selection'; END IF;
  IF (SELECT count(*) FROM public.quiz_exam_sessions WHERE user_id=_user AND created_at>clock_timestamp()-interval '24 hours')>=50 THEN RAISE EXCEPTION 'You have reached the daily limit for new random quiz attempts'; END IF;
  FOREACH index_value IN ARRAY _selection LOOP
    IF index_value IS NULL OR index_value<0 OR index_value>=jsonb_array_length(pool) OR NOT coalesce(public.question_bank_valid(pool->index_value,keys->index_value),false) THEN RAISE EXCEPTION 'Question pool contains an invalid question or answer'; END IF;
    questions:=questions||jsonb_build_array(pool->index_value); answers:=answers||jsonb_build_array(keys->index_value);
  END LOOP;
  INSERT INTO public.quiz_exam_sessions(course_id,lesson_id,user_id,questions,answers,pass_mark) VALUES(course_ref,_lesson,_user,questions,answers,substring(lesson.body FROM '^pass:([0-9]+)')::integer) RETURNING * INTO session_row;
  PERFORM set_config('request.jwt.claim.sub',coalesce(previous_sub,''),true);
  RETURN jsonb_build_object('attemptId',session_row.id,'questions',questions,'expiresAt',session_row.expires_at);
END;
$$;
REVOKE ALL ON FUNCTION public.start_quiz_exam(uuid,uuid,text,jsonb,jsonb,integer[]) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.start_quiz_exam(uuid,uuid,text,jsonb,jsonb,integer[]) TO service_role;

CREATE OR REPLACE FUNCTION public.studio_snapshot(_id uuid)
RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path='' AS $$
  SELECT jsonb_build_object('course',to_jsonb(c),
    'modules',coalesce((SELECT jsonb_agg(to_jsonb(m) ORDER BY position) FROM public.studio_modules m WHERE course_id=_id),'[]'::jsonb),
    'lessons',coalesce((SELECT jsonb_agg(to_jsonb(l)||CASE WHEN b.id IS NOT NULL THEN jsonb_build_object('quiz',b.questions,'secure_bank',true,'body',regexp_replace(l.body,E'\nbank:[0-9a-f-]+$','')) ELSE '{}'::jsonb END ORDER BY l.position,l.id)
      FROM public.studio_lessons l LEFT JOIN public.studio_exam_banks b ON b.id=public.private_quiz_bank_id(l.body) AND b.owner_id=c.author_id WHERE l.course_id=_id),'[]'::jsonb),
    'answers',coalesce((SELECT jsonb_agg(to_jsonb(a)||CASE WHEN b.id IS NOT NULL THEN jsonb_build_object('answers',b.answers) ELSE '{}'::jsonb END ORDER BY a.lesson_id)
      FROM public.studio_quiz_answers a JOIN public.studio_lessons l ON l.id=a.lesson_id LEFT JOIN public.studio_exam_banks b ON b.id=public.private_quiz_bank_id(l.body) AND b.owner_id=c.author_id WHERE a.course_id=_id),'[]'::jsonb),
    'videos',coalesce((SELECT jsonb_agg(to_jsonb(v)) FROM public.course_external_content v WHERE course_id=_id),'[]'::jsonb)) FROM public.studio_courses c WHERE id=_id
$$;
REVOKE ALL ON FUNCTION public.studio_snapshot(uuid) FROM PUBLIC,anon,authenticated;
DO $restore_private$
DECLARE definition text; original text:=$old$      PERFORM public.studio_save_quiz_pool(lid,lesson->>'title',pass_mark,lesson->'quiz',key,sample);$old$;
BEGIN
  SELECT pg_get_functiondef('public.restore_course_archive(uuid,jsonb)'::regprocedure) INTO definition;
  IF array_length(string_to_array(definition,original),1)<>2 THEN RAISE EXCEPTION 'Unexpected archive restore definition'; END IF;
  EXECUTE replace(definition,original,$new$
      IF coalesce((lesson->>'secure_bank')::boolean,false) THEN
        PERFORM public.studio_save_private_quiz(lid,lesson->>'title',pass_mark,lesson->'quiz',key,sample);
      ELSE
        PERFORM public.studio_save_quiz_pool(lid,lesson->>'title',pass_mark,lesson->'quiz',key,sample);
      END IF;
$new$);
END;
$restore_private$;
COMMIT;
