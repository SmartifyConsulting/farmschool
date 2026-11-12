BEGIN;

CREATE OR REPLACE FUNCTION public.course_gradebook(_course uuid,_offset integer DEFAULT 0,_limit integer DEFAULT 50)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE course_row public.studio_courses; candidates uuid[]; person uuid; people jsonb:='[]'; lessons jsonb; competencies jsonb; completed jsonb; quizzes jsonb; outcomes jsonb; pending integer; certified boolean; person_name text;
BEGIN
  SELECT * INTO course_row FROM public.studio_courses WHERE id=_course AND author_id=auth.uid() AND revision_of IS NULL;
  IF NOT FOUND OR auth.uid() IS NULL THEN RAISE EXCEPTION 'Only the course author can view this gradebook'; END IF;
  IF _offset IS NULL OR _offset<0 OR _limit IS NULL OR _limit NOT BETWEEN 1 AND 200 THEN RAISE EXCEPTION 'Invalid gradebook page'; END IF;
  SELECT COALESCE(array_agg(DISTINCT user_id ORDER BY user_id),'{}'::uuid[]) INTO candidates FROM (
    SELECT e.user_id FROM public.course_enrollments e WHERE e.course_id=_course
    UNION SELECT p.user_id FROM public.lesson_progress p WHERE p.course_id=_course::text
    UNION SELECT q.user_id FROM public.quiz_attempts q WHERE q.course_id=_course::text
    UNION SELECT m.user_id FROM public.cohort_members m JOIN public.cohort_course_assignments a ON a.cohort_id=m.cohort_id WHERE a.course_id=_course
    UNION SELECT e.user_id FROM public.learner_competency_evidence e JOIN public.course_competencies cc ON cc.id=e.competency_id WHERE cc.course_id=_course
    UNION SELECT s.user_id FROM public.competency_submissions s JOIN public.course_competencies cc ON cc.id=s.competency_id WHERE cc.course_id=_course
  ) all_learners;
  SELECT COALESCE(jsonb_agg(jsonb_build_object('id',id,'title',title,'kind',kind) ORDER BY position,id),'[]') INTO lessons FROM public.studio_lessons WHERE course_id=_course;
  SELECT COALESCE(jsonb_agg(jsonb_build_object('id',id,'code',code,'title',title) ORDER BY code,id),'[]') INTO competencies FROM public.course_competencies WHERE course_id=_course;
  FOR person IN SELECT unnest(candidates) OFFSET _offset LIMIT _limit LOOP
    SELECT COALESCE(full_name,'Learner') INTO person_name FROM public.profiles WHERE user_id=person;
    SELECT COALESCE(jsonb_agg(l.id ORDER BY l.id),'[]') INTO completed FROM public.lesson_progress p JOIN public.studio_lessons l ON l.id::text=p.lesson_id AND l.course_id=_course WHERE p.user_id=person AND p.course_id=_course::text AND p.completed;
    SELECT COALESCE(jsonb_object_agg(latest.lesson_id,jsonb_build_object('score',latest.score,'passed',latest.passed,'attempts',latest.attempts)),'{}') INTO quizzes FROM (
      SELECT DISTINCT ON(q.lesson_id) q.lesson_id,q.score,q.passed,count(*) OVER(PARTITION BY q.lesson_id) AS attempts
      FROM public.quiz_attempts q JOIN public.studio_lessons l ON l.id::text=q.lesson_id AND l.course_id=_course AND l.kind='quiz'
      WHERE q.user_id=person AND q.course_id=_course::text ORDER BY q.lesson_id,q.created_at DESC,q.id DESC
    ) latest;
    SELECT COALESCE(jsonb_object_agg(latest.competency_id::text,jsonb_build_object('score',latest.score,'achieved',latest.achieved,'assessedAt',COALESCE(latest.assessed_at,latest.created_at),'source',latest.source_type)),'{}') INTO outcomes FROM (
      SELECT DISTINCT ON(e.competency_id) e.* FROM public.learner_competency_evidence e JOIN public.course_competencies cc ON cc.id=e.competency_id
      WHERE e.user_id=person AND cc.course_id=_course ORDER BY e.competency_id,e.assessed_at DESC NULLS LAST,e.created_at DESC,e.id DESC
    ) latest;
    SELECT count(*) INTO pending FROM public.competency_submissions s JOIN public.course_competencies cc ON cc.id=s.competency_id WHERE s.user_id=person AND cc.course_id=_course AND s.assessment_id IS NULL;
    SELECT EXISTS(SELECT 1 FROM public.certificates c WHERE c.user_id=person AND c.source='studio' AND c.course_ref=_course::text) INTO certified;
    people:=people||jsonb_build_array(jsonb_build_object('userId',person,'name',COALESCE(NULLIF(person_name,''),'Learner'),'completedLessons',completed,'quizScores',quizzes,'competencyScores',outcomes,'pendingSubmissions',pending,'certified',certified));
  END LOOP;
  RETURN jsonb_build_object('course',jsonb_build_object('id',course_row.id,'title',course_row.title),'total',cardinality(candidates),'offset',_offset,'limit',_limit,'lessons',lessons,'competencies',competencies,'learners',people);
END;
$$;
REVOKE ALL ON FUNCTION public.course_gradebook(uuid,integer,integer) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.course_gradebook(uuid,integer,integer) TO authenticated,service_role;

COMMIT;
