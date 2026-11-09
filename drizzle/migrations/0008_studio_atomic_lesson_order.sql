CREATE OR REPLACE FUNCTION public.studio_move_lesson(_course_id uuid,_lesson_id uuid,_direction integer) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE ids uuid[]; idx integer; other integer; temp uuid;
BEGIN
 IF auth.uid() IS NULL OR NOT public.studio_course_owned(_course_id) THEN RAISE EXCEPTION 'Only the course owner may reorder lessons'; END IF;
 PERFORM 1 FROM public.studio_courses WHERE id=_course_id AND NOT published FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Create a revision before editing'; END IF;
 IF _direction NOT IN (-1,1) THEN RAISE EXCEPTION 'Invalid direction'; END IF;
 SELECT array_agg(id ORDER BY position,created_at,id) INTO ids FROM public.studio_lessons WHERE course_id=_course_id;
 idx := array_position(ids,_lesson_id); other := idx+_direction;
 IF idx IS NULL OR other<1 OR other>cardinality(ids) THEN RETURN; END IF;
 temp := ids[idx]; ids[idx] := ids[other]; ids[other] := temp;
 UPDATE public.studio_lessons l SET position=a.ordinality-1 FROM unnest(ids) WITH ORDINALITY a(id,ordinality) WHERE l.id=a.id AND l.course_id=_course_id;
END $$;
REVOKE ALL ON FUNCTION public.studio_move_lesson(uuid,uuid,integer) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.studio_move_lesson(uuid,uuid,integer) TO authenticated;