BEGIN;

ALTER TABLE public.studio_quiz_answers ALTER COLUMN answers DROP DEFAULT;
ALTER TABLE public.studio_quiz_answers
  ALTER COLUMN answers TYPE jsonb USING to_jsonb(answers);
ALTER TABLE public.studio_quiz_answers ALTER COLUMN answers SET DEFAULT '[]'::jsonb;
ALTER TABLE public.studio_quiz_answers DROP CONSTRAINT IF EXISTS studio_quiz_answers_array;
ALTER TABLE public.studio_quiz_answers
  ADD CONSTRAINT studio_quiz_answers_array CHECK (jsonb_typeof(answers) = 'array');

-- Keep the existing course generator compatible with the new answer-key column.
DO $$
DECLARE
  definition text := pg_get_functiondef('public.studio_save_generated_course(uuid,jsonb,text,integer)'::regprocedure);
  original text := 'VALUES (_quiz_id,_course_id,_answers)';
  updated text := 'VALUES (_quiz_id,_course_id,to_jsonb(_answers))';
BEGIN
  IF strpos(definition, updated) > 0 THEN RETURN; END IF;
  IF strpos(definition, original) = 0 THEN
    RAISE EXCEPTION 'Unexpected course generator definition; migration rolled back';
  END IF;
  EXECUTE replace(definition, original, updated);
END;
$$;

CREATE OR REPLACE FUNCTION public.studio_save_quiz(
  _lesson_id uuid, _title text, _pass_mark integer, _questions jsonb, _answers jsonb
) RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE saved_course uuid;
BEGIN
  IF _title IS NULL OR char_length(btrim(_title)) NOT BETWEEN 1 AND 120
     OR _pass_mark IS NULL OR _pass_mark NOT IN (50,60,70,75,80,90,100)
     OR jsonb_typeof(_questions) IS DISTINCT FROM 'array'
     OR jsonb_typeof(_answers) IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'Invalid quiz';
  END IF;
  IF jsonb_array_length(_questions) NOT BETWEEN 1 AND 50
     OR jsonb_array_length(_questions) <> jsonb_array_length(_answers) THEN
    RAISE EXCEPTION 'Invalid quiz questions or answer keys';
  END IF;

  SELECT course.id INTO saved_course
  FROM public.studio_lessons AS lesson
  JOIN public.studio_courses AS course ON course.id = lesson.course_id
  WHERE lesson.id = _lesson_id AND lesson.kind = 'quiz'
    AND course.author_id = auth.uid() AND NOT course.published
  FOR UPDATE OF course;
  IF saved_course IS NULL THEN RAISE EXCEPTION 'Draft quiz not found'; END IF;

  UPDATE public.studio_lessons
  SET title = btrim(_title), body = 'pass:' || _pass_mark, quiz = _questions
  WHERE id = _lesson_id AND course_id = saved_course AND kind = 'quiz';
  IF NOT FOUND THEN RAISE EXCEPTION 'Draft quiz not found'; END IF;

  INSERT INTO public.studio_quiz_answers (lesson_id, course_id, answers)
  VALUES (_lesson_id, saved_course, _answers)
  ON CONFLICT (lesson_id) DO UPDATE SET answers = EXCLUDED.answers;
END;
$$;
REVOKE ALL ON FUNCTION public.studio_save_quiz(uuid,text,integer,jsonb,jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.studio_save_quiz(uuid,text,integer,jsonb,jsonb) TO authenticated;

COMMIT;
