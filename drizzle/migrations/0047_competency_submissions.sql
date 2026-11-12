BEGIN;

CREATE TABLE public.competency_submissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  competency_id uuid NOT NULL REFERENCES public.course_competencies(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  attempt integer NOT NULL CHECK(attempt>0),
  body text NOT NULL CHECK(char_length(body) BETWEEN 20 AND 20000),
  evidence_url text,
  competency_title text NOT NULL,
  instructions text NOT NULL,
  criteria_snapshot jsonb NOT NULL,
  pass_mark numeric(5,2) NOT NULL,
  rubric_version integer NOT NULL,
  submitted_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  reviewed_at timestamptz,
  assessment_id uuid UNIQUE REFERENCES public.learner_competency_evidence(id),
  UNIQUE(user_id,competency_id,attempt)
);
CREATE INDEX competency_submissions_pending_idx ON public.competency_submissions(competency_id,submitted_at) WHERE assessment_id IS NULL;
ALTER TABLE public.competency_submissions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.competency_submissions FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.competency_submissions TO authenticated;
GRANT ALL ON public.competency_submissions TO service_role;
CREATE POLICY "Learners read own submissions" ON public.competency_submissions FOR SELECT TO authenticated USING(user_id=auth.uid());
CREATE POLICY "Authors read course submissions" ON public.competency_submissions FOR SELECT TO authenticated
USING(EXISTS(SELECT 1 FROM public.course_competencies cc JOIN public.studio_courses c ON c.id=cc.course_id WHERE cc.id=competency_id AND c.author_id=auth.uid()));

CREATE OR REPLACE FUNCTION public.submit_competency_work(_competency uuid,_body text,_evidence_url text,_expected_version integer)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE competency public.course_competencies; course_row public.studio_courses; next_attempt integer; result uuid;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Sign in to submit work'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(auth.uid()::text||':'||_competency::text,0));
  SELECT * INTO competency FROM public.course_competencies WHERE id=_competency FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Competency unavailable'; END IF;
  SELECT * INTO course_row FROM public.studio_courses WHERE id=competency.course_id;
  IF NOT course_row.published OR course_row.author_id=auth.uid() OR NOT public.studio_course_visible(course_row.id) THEN RAISE EXCEPTION 'This course is not available for submission'; END IF;
  IF competency.rubric_version=0 OR jsonb_array_length(competency.rubric)=0 THEN RAISE EXCEPTION 'This competency has no submission rubric'; END IF;
  IF _expected_version IS DISTINCT FROM competency.rubric_version THEN RAISE EXCEPTION 'Rubric changed. Refresh before submitting'; END IF;
  IF char_length(btrim(COALESCE(_body,''))) NOT BETWEEN 20 AND 20000 THEN RAISE EXCEPTION 'Provide 20 to 20000 characters of written evidence'; END IF;
  IF COALESCE(_evidence_url,'')<>'' AND (char_length(_evidence_url)>2000 OR _evidence_url !~ '^https://[^/@[:space:]]+([/?#][^[:space:]]*)?$') THEN RAISE EXCEPTION 'Use a secure HTTPS evidence link without embedded credentials'; END IF;
  IF EXISTS(SELECT 1 FROM public.competency_submissions WHERE competency_id=_competency AND user_id=auth.uid() AND assessment_id IS NULL) THEN RAISE EXCEPTION 'Wait for your trainer to review your pending submission'; END IF;
  SELECT COALESCE(max(attempt),0)+1 INTO next_attempt FROM public.competency_submissions WHERE competency_id=_competency AND user_id=auth.uid();
  INSERT INTO public.competency_submissions(competency_id,user_id,attempt,body,evidence_url,competency_title,instructions,criteria_snapshot,pass_mark,rubric_version)
  VALUES(_competency,auth.uid(),next_attempt,btrim(_body),NULLIF(_evidence_url,''),competency.title,competency.description,competency.rubric,competency.rubric_pass_mark,competency.rubric_version) RETURNING id INTO result;
  RETURN result;
END;
$$;

CREATE OR REPLACE FUNCTION public.course_assessment_learners(_course uuid)
RETURNS TABLE(user_id uuid,full_name text) LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT EXISTS(SELECT 1 FROM public.studio_courses WHERE id=_course AND author_id=auth.uid() AND revision_of IS NULL) THEN RAISE EXCEPTION 'Only the course author can view assessment learners'; END IF;
  RETURN QUERY WITH candidates AS (
    SELECT e.user_id FROM public.course_enrollments e WHERE e.course_id=_course AND (e.payment_status IS NULL OR e.payment_status IN ('paid','free'))
    UNION SELECT p.user_id FROM public.lesson_progress p WHERE p.course_id=_course::text
    UNION SELECT m.user_id FROM public.cohort_members m JOIN public.cohort_course_assignments a ON a.cohort_id=m.cohort_id WHERE a.course_id=_course
    UNION SELECT s.user_id FROM public.competency_submissions s JOIN public.course_competencies cc ON cc.id=s.competency_id WHERE cc.course_id=_course
  ) SELECT candidate.user_id,COALESCE(p.full_name,'Learner') FROM candidates candidate LEFT JOIN public.profiles p ON p.user_id=candidate.user_id JOIN public.studio_courses c ON c.id=_course
  WHERE c.price_cents=0 OR EXISTS(SELECT 1 FROM public.course_enrollments e WHERE e.course_id=_course AND e.user_id=candidate.user_id AND (e.payment_status IS NULL OR e.payment_status IN ('paid','free')))
  ORDER BY COALESCE(p.full_name,'Learner'),candidate.user_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.assess_competency_submission(_submission uuid,_marks jsonb,_notes text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE submission public.competency_submissions; item jsonb; mark numeric; maximum numeric:=0; earned numeric:=0; score numeric; evidence_ref uuid;
BEGIN
  SELECT s.* INTO submission FROM public.competency_submissions s JOIN public.course_competencies cc ON cc.id=s.competency_id JOIN public.studio_courses c ON c.id=cc.course_id
  WHERE s.id=_submission AND c.author_id=auth.uid() AND c.revision_of IS NULL FOR UPDATE OF s;
  IF NOT FOUND OR auth.uid() IS NULL THEN RAISE EXCEPTION 'Only the course author can assess this submission'; END IF;
  IF submission.assessment_id IS NOT NULL THEN RAISE EXCEPTION 'This submission has already been assessed'; END IF;
  IF _marks IS NULL OR jsonb_typeof(_marks)<>'object' THEN RAISE EXCEPTION 'Invalid criterion scores'; END IF;
  IF (SELECT count(*) FROM jsonb_object_keys(_marks))<>jsonb_array_length(submission.criteria_snapshot) THEN RAISE EXCEPTION 'Score every criterion exactly once'; END IF;
  FOR item IN SELECT value FROM jsonb_array_elements(submission.criteria_snapshot) LOOP
    IF jsonb_typeof(_marks->(item->>'id')) IS DISTINCT FROM 'number' THEN RAISE EXCEPTION 'Missing criterion score'; END IF;
    mark:=(_marks->>(item->>'id'))::numeric;
    IF mark<0 OR mark>(item->>'maxPoints')::numeric OR scale(mark)>2 THEN RAISE EXCEPTION 'Criterion score outside allowed range'; END IF;
    maximum:=maximum+(item->>'maxPoints')::numeric;
    earned:=earned+mark;
  END LOOP;
  score:=round(earned/maximum*100,2);
  evidence_ref:=public.record_competency_assessment(submission.competency_id,submission.user_id,score>=submission.pass_mark,score,_notes);
  UPDATE public.learner_competency_evidence SET source_type='submission',source_id=submission.id::text WHERE id=evidence_ref;
  INSERT INTO public.competency_rubric_assessments(evidence_id,criteria_snapshot,marks,total_points,max_points,pass_mark,rubric_version)
  VALUES(evidence_ref,submission.criteria_snapshot,_marks,earned,maximum,submission.pass_mark,submission.rubric_version);
  UPDATE public.competency_submissions SET assessment_id=evidence_ref,reviewed_at=clock_timestamp() WHERE id=_submission;
  RETURN evidence_ref;
END;
$$;
REVOKE ALL ON FUNCTION public.submit_competency_work(uuid,text,text,integer),public.assess_competency_submission(uuid,jsonb,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.submit_competency_work(uuid,text,text,integer),public.assess_competency_submission(uuid,jsonb,text) TO authenticated,service_role;

COMMIT;
