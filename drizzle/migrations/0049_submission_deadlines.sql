BEGIN;

ALTER TABLE public.course_competencies ADD COLUMN IF NOT EXISTS late_submissions_allowed boolean NOT NULL DEFAULT true;
ALTER TABLE public.competency_submissions
  ADD COLUMN IF NOT EXISTS due_at timestamptz,
  ADD COLUMN IF NOT EXISTS late boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS late_allowed boolean NOT NULL DEFAULT true;

CREATE OR REPLACE FUNCTION public.set_competency_late_policy(_competency uuid,_allow_late boolean,_expected_allowed boolean)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE current_allowed boolean;
BEGIN
  SELECT cc.late_submissions_allowed INTO current_allowed FROM public.course_competencies cc JOIN public.studio_courses c ON c.id=cc.course_id
  WHERE cc.id=_competency AND c.author_id=auth.uid() AND c.revision_of IS NULL FOR UPDATE OF cc;
  IF NOT FOUND OR auth.uid() IS NULL THEN RAISE EXCEPTION 'Only the course author can change submission policies'; END IF;
  IF _allow_late IS NULL THEN RAISE EXCEPTION 'Choose a late submission policy'; END IF;
  IF _expected_allowed IS DISTINCT FROM current_allowed THEN RAISE EXCEPTION 'Policy changed. Refresh before saving'; END IF;
  UPDATE public.course_competencies SET late_submissions_allowed=_allow_late WHERE id=_competency;
  RETURN _allow_late;
END;
$$;

CREATE OR REPLACE FUNCTION public.my_course_submission_deadline(_course uuid)
RETURNS timestamptz LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE due timestamptz;
BEGIN
  IF auth.uid() IS NULL OR NOT public.studio_course_visible(_course) THEN RAISE EXCEPTION 'Course is not available'; END IF;
  SELECT min(a.due_at) INTO due FROM public.cohort_course_assignments a JOIN public.cohort_members m ON m.cohort_id=a.cohort_id
  WHERE a.course_id=_course AND m.user_id=auth.uid();
  RETURN due;
END;
$$;

CREATE OR REPLACE FUNCTION public.submit_competency_work(_competency uuid,_body text,_evidence_url text,_expected_version integer)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE competency public.course_competencies; course_row public.studio_courses; next_attempt integer; result uuid; due timestamptz; submitted timestamptz;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Sign in to submit work'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(auth.uid()::text||':'||_competency::text,0));
  SELECT * INTO competency FROM public.course_competencies WHERE id=_competency FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Competency unavailable'; END IF;
  SELECT * INTO course_row FROM public.studio_courses WHERE id=competency.course_id;
  IF NOT course_row.published OR course_row.author_id=auth.uid() OR NOT public.studio_course_visible(course_row.id) THEN RAISE EXCEPTION 'This course is not available for submission'; END IF;
  IF competency.rubric_version=0 OR jsonb_array_length(competency.rubric)=0 THEN RAISE EXCEPTION 'This competency has no submission rubric'; END IF;
  IF _expected_version IS DISTINCT FROM competency.rubric_version THEN RAISE EXCEPTION 'Rubric changed. Refresh before submitting'; END IF;
  SELECT min(a.due_at) INTO due FROM public.cohort_course_assignments a JOIN public.cohort_members m ON m.cohort_id=a.cohort_id WHERE a.course_id=course_row.id AND m.user_id=auth.uid();
  submitted:=clock_timestamp();
  IF due IS NOT NULL AND submitted>due AND NOT competency.late_submissions_allowed THEN RAISE EXCEPTION 'The submission deadline has passed. Contact your trainer for an extension'; END IF;
  IF char_length(btrim(COALESCE(_body,''))) NOT BETWEEN 20 AND 20000 THEN RAISE EXCEPTION 'Provide 20 to 20000 characters of written evidence'; END IF;
  IF COALESCE(_evidence_url,'')<>'' AND (char_length(_evidence_url)>2000 OR _evidence_url !~ '^https://[^/@[:space:]]+([/?#][^[:space:]]*)?$') THEN RAISE EXCEPTION 'Use a secure HTTPS evidence link without embedded credentials'; END IF;
  IF EXISTS(SELECT 1 FROM public.competency_submissions WHERE competency_id=_competency AND user_id=auth.uid() AND assessment_id IS NULL) THEN RAISE EXCEPTION 'Wait for your trainer to review your pending submission'; END IF;
  SELECT COALESCE(max(attempt),0)+1 INTO next_attempt FROM public.competency_submissions WHERE competency_id=_competency AND user_id=auth.uid();
  INSERT INTO public.competency_submissions(competency_id,user_id,attempt,body,evidence_url,competency_title,instructions,criteria_snapshot,pass_mark,rubric_version,submitted_at,due_at,late,late_allowed)
  VALUES(_competency,auth.uid(),next_attempt,btrim(_body),NULLIF(_evidence_url,''),competency.title,competency.description,competency.rubric,competency.rubric_pass_mark,competency.rubric_version,submitted,due,due IS NOT NULL AND submitted>due,competency.late_submissions_allowed) RETURNING id INTO result;
  RETURN result;
END;
$$;

REVOKE ALL ON FUNCTION public.set_competency_late_policy(uuid,boolean,boolean),public.my_course_submission_deadline(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.set_competency_late_policy(uuid,boolean,boolean),public.my_course_submission_deadline(uuid) TO authenticated,service_role;

COMMIT;
