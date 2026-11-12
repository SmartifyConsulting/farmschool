BEGIN;

REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.course_competencies, public.learner_competency_evidence FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.add_course_competency(_course uuid,_code text,_title text,_description text DEFAULT '')
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE result uuid;
BEGIN
  IF auth.uid() IS NULL OR NOT EXISTS(SELECT 1 FROM public.studio_courses WHERE id=_course AND author_id=auth.uid() AND revision_of IS NULL) THEN
    RAISE EXCEPTION 'Only the course author can define competencies';
  END IF;
  IF char_length(btrim(COALESCE(_code,''))) NOT BETWEEN 1 AND 40
     OR char_length(btrim(COALESCE(_title,''))) NOT BETWEEN 3 AND 200
     OR char_length(COALESCE(_description,'')) > 2000 THEN RAISE EXCEPTION 'Invalid competency details'; END IF;
  INSERT INTO public.course_competencies(course_id,code,title,description)
  VALUES(_course,btrim(_code),btrim(_title),COALESCE(_description,'')) RETURNING id INTO result;
  RETURN result;
END;
$$;

CREATE OR REPLACE FUNCTION public.course_assessment_learners(_course uuid)
RETURNS TABLE(user_id uuid,full_name text) LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT EXISTS(SELECT 1 FROM public.studio_courses WHERE id=_course AND author_id=auth.uid() AND revision_of IS NULL) THEN
    RAISE EXCEPTION 'Only the course author can view assessment learners';
  END IF;
  RETURN QUERY
  WITH candidates AS (
    SELECT e.user_id FROM public.course_enrollments e WHERE e.course_id=_course AND (e.payment_status IS NULL OR e.payment_status IN ('paid','free'))
    UNION SELECT p.user_id FROM public.lesson_progress p WHERE p.course_id=_course::text
    UNION SELECT m.user_id FROM public.cohort_members m JOIN public.cohort_course_assignments a ON a.cohort_id=m.cohort_id WHERE a.course_id=_course
  )
  SELECT candidate.user_id,COALESCE(p.full_name,'Learner') FROM candidates candidate
  LEFT JOIN public.profiles p ON p.user_id=candidate.user_id
  JOIN public.studio_courses c ON c.id=_course
  WHERE c.price_cents=0 OR EXISTS(SELECT 1 FROM public.course_enrollments e WHERE e.course_id=_course AND e.user_id=candidate.user_id AND (e.payment_status IS NULL OR e.payment_status IN ('paid','free')))
  ORDER BY COALESCE(p.full_name,'Learner'),candidate.user_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.record_competency_assessment(_competency uuid,_learner uuid,_achieved boolean,_score numeric,_notes text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE course_ref uuid; result uuid;
BEGIN
  SELECT c.id INTO course_ref FROM public.course_competencies cc JOIN public.studio_courses c ON c.id=cc.course_id
  WHERE cc.id=_competency AND c.author_id=auth.uid() AND c.revision_of IS NULL;
  IF course_ref IS NULL OR auth.uid() IS NULL THEN RAISE EXCEPTION 'Only the course author can assess competency'; END IF;
  IF _achieved IS NULL OR _score IS NULL OR _score < 0 OR _score > 100 OR _score::text IN ('NaN','Infinity','-Infinity')
     OR char_length(btrim(COALESCE(_notes,''))) NOT BETWEEN 10 AND 2000 THEN
    RAISE EXCEPTION 'Provide a score from 0 to 100 and supporting assessment notes';
  END IF;
  IF NOT EXISTS(SELECT 1 FROM public.course_assessment_learners(course_ref) learner WHERE learner.user_id=_learner) THEN
    RAISE EXCEPTION 'Learner is not eligible for assessment in this course';
  END IF;
  INSERT INTO public.learner_competency_evidence(user_id,competency_id,source_type,source_id,achieved,score,assessed_by,assessed_at,notes)
  VALUES(_learner,_competency,'trainer',gen_random_uuid()::text,_achieved,_score,auth.uid(),now(),btrim(_notes)) RETURNING id INTO result;
  RETURN result;
END;
$$;

REVOKE ALL ON FUNCTION public.add_course_competency(uuid,text,text,text),public.course_assessment_learners(uuid),public.record_competency_assessment(uuid,uuid,boolean,numeric,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.add_course_competency(uuid,text,text,text),public.course_assessment_learners(uuid),public.record_competency_assessment(uuid,uuid,boolean,numeric,text) TO authenticated,service_role;

COMMIT;
