CREATE OR REPLACE FUNCTION public.studio_save_generated_course(_course_id uuid, _draft jsonb, _level text, _pass_mark integer)
RETURNS uuid LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $function$
DECLARE _lesson jsonb; _question jsonb; _quiz_id uuid; _position integer := 0; _questions jsonb := '[]'::jsonb; _answers integer[] := '{}'; _existing public.studio_courses%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not signed in'; END IF;
  SELECT * INTO _existing FROM public.studio_courses WHERE id = _course_id;
  IF FOUND THEN
    IF _existing.author_id <> auth.uid() OR _existing.published THEN RAISE EXCEPTION 'Only your own draft can be saved'; END IF;
    RETURN _course_id;
  END IF;
  IF octet_length(_draft::text) > 200000 OR _level NOT IN ('Beginner','Intermediate','Advanced') OR _pass_mark NOT IN (50,60,70,75,80,90,100) THEN RAISE EXCEPTION 'Invalid course settings'; END IF;
  IF length(_draft->>'title') NOT BETWEEN 3 AND 120 OR length(_draft->>'description') NOT BETWEEN 20 AND 4000 OR length(_draft->>'category') NOT BETWEEN 2 AND 100 OR jsonb_typeof(_draft->'lessons') IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'Invalid course draft'; END IF;
  IF jsonb_array_length(_draft->'lessons') NOT BETWEEN 2 AND 8 OR jsonb_typeof(_draft->'quiz'->'questions') IS DISTINCT FROM 'array' OR length(_draft->'quiz'->>'title') NOT BETWEEN 3 AND 120 THEN RAISE EXCEPTION 'Invalid course lessons'; END IF;
  IF jsonb_array_length(_draft->'quiz'->'questions') NOT BETWEEN 3 AND 8 THEN RAISE EXCEPTION 'Invalid quiz'; END IF;
  INSERT INTO public.studio_courses(id,author_id,title,description,category,level,published) VALUES (_course_id,auth.uid(),_draft->>'title',_draft->>'description',_draft->>'category',_level,false);
  FOR _lesson IN SELECT value FROM jsonb_array_elements(_draft->'lessons') LOOP
    IF length(_lesson->>'title') NOT BETWEEN 3 AND 120 OR length(_lesson->>'body') NOT BETWEEN 200 AND 20000 OR _lesson->>'title' IS NULL OR _lesson->>'body' IS NULL THEN RAISE EXCEPTION 'Invalid lesson'; END IF;
    INSERT INTO public.studio_lessons(course_id,position,kind,title,body) VALUES (_course_id,_position,'reading',_lesson->>'title',_lesson->>'body');
    _position := _position + 1;
  END LOOP;
  FOR _question IN SELECT value FROM jsonb_array_elements(_draft->'quiz'->'questions') LOOP
    IF length(_question->>'question') NOT BETWEEN 10 AND 500 OR _question->>'question' IS NULL OR jsonb_typeof(_question->'options') IS DISTINCT FROM 'array' OR (_question->>'correctIndex') IS NULL THEN RAISE EXCEPTION 'Invalid question'; END IF;
    IF jsonb_array_length(_question->'options') <> 4 OR (_question->>'correctIndex')::integer NOT BETWEEN 0 AND 3 OR EXISTS (SELECT 1 FROM jsonb_array_elements(_question->'options') o WHERE jsonb_typeof(o) <> 'string' OR length(o#>>'{}') NOT BETWEEN 1 AND 300) THEN RAISE EXCEPTION 'Invalid answer options'; END IF;
    _questions := _questions || jsonb_build_array(jsonb_build_object('question',_question->>'question','options',_question->'options'));
    _answers := array_append(_answers,(_question->>'correctIndex')::integer);
  END LOOP;
  INSERT INTO public.studio_lessons(course_id,position,kind,title,body,quiz) VALUES (_course_id,_position,'quiz',_draft->'quiz'->>'title','pass:'||_pass_mark::text,_questions) RETURNING id INTO _quiz_id;
  INSERT INTO public.studio_quiz_answers(lesson_id,course_id,answers) VALUES (_quiz_id,_course_id,_answers);
  RETURN _course_id;
END;
$function$;
REVOKE ALL ON FUNCTION public.studio_save_generated_course(uuid,jsonb,text,integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.studio_save_generated_course(uuid,jsonb,text,integer) TO authenticated;