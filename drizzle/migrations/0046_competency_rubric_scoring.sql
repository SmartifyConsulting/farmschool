BEGIN;

ALTER TABLE public.course_competencies
  ADD COLUMN IF NOT EXISTS rubric jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS rubric_pass_mark numeric(5,2) NOT NULL DEFAULT 80,
  ADD COLUMN IF NOT EXISTS rubric_version integer NOT NULL DEFAULT 0;

CREATE TABLE public.competency_rubric_assessments (
  evidence_id uuid PRIMARY KEY REFERENCES public.learner_competency_evidence(id) ON DELETE CASCADE,
  criteria_snapshot jsonb NOT NULL,
  marks jsonb NOT NULL,
  total_points numeric(12,2) NOT NULL,
  max_points numeric(12,2) NOT NULL,
  pass_mark numeric(5,2) NOT NULL,
  rubric_version integer NOT NULL
);
ALTER TABLE public.competency_rubric_assessments ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.competency_rubric_assessments FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.competency_rubric_assessments TO authenticated;
GRANT ALL ON public.competency_rubric_assessments TO service_role;
CREATE POLICY "Read snapshots of visible evidence" ON public.competency_rubric_assessments FOR SELECT TO authenticated
USING(EXISTS(SELECT 1 FROM public.learner_competency_evidence e WHERE e.id=evidence_id));

CREATE OR REPLACE FUNCTION public.save_competency_rubric(_competency uuid,_criteria jsonb,_pass_mark numeric,_expected_version integer)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE competency public.course_competencies; item jsonb; seen text[] := '{}'; maximum numeric;
BEGIN
  SELECT cc.* INTO competency FROM public.course_competencies cc JOIN public.studio_courses c ON c.id=cc.course_id
  WHERE cc.id=_competency AND c.author_id=auth.uid() AND c.revision_of IS NULL FOR UPDATE OF cc;
  IF NOT FOUND OR auth.uid() IS NULL THEN RAISE EXCEPTION 'Only the course author can define rubrics'; END IF;
  IF _expected_version IS DISTINCT FROM competency.rubric_version THEN RAISE EXCEPTION 'Rubric changed. Refresh before saving'; END IF;
  IF _pass_mark IS NULL OR _pass_mark::text IN ('NaN','Infinity','-Infinity') OR _pass_mark NOT BETWEEN 1 AND 100 OR scale(_pass_mark)>2 THEN RAISE EXCEPTION 'Invalid pass mark'; END IF;
  IF _criteria IS NULL OR jsonb_typeof(_criteria)<>'array' THEN RAISE EXCEPTION 'Invalid criteria'; END IF;
  IF jsonb_array_length(_criteria) NOT BETWEEN 1 AND 30 THEN RAISE EXCEPTION 'Provide 1 to 30 criteria'; END IF;
  FOR item IN SELECT value FROM jsonb_array_elements(_criteria) LOOP
    IF jsonb_typeof(item)<>'object' OR jsonb_typeof(item->'id') IS DISTINCT FROM 'string' OR (item->>'id')=ANY(seen)
       OR jsonb_typeof(item->'title') IS DISTINCT FROM 'string' OR jsonb_typeof(item->'description') IS DISTINCT FROM 'string'
       OR char_length(btrim(COALESCE(item->>'title',''))) NOT BETWEEN 3 AND 200
       OR char_length(COALESCE(item->>'description',''))>2000 OR jsonb_typeof(item->'maxPoints') IS DISTINCT FROM 'number' THEN RAISE EXCEPTION 'Invalid rubric criterion'; END IF;
    PERFORM (item->>'id')::uuid;
    maximum := (item->>'maxPoints')::numeric;
    IF maximum NOT BETWEEN 0.01 AND 1000 OR scale(maximum)>2 THEN RAISE EXCEPTION 'Invalid criterion points'; END IF;
    seen := array_append(seen,item->>'id');
  END LOOP;
  UPDATE public.course_competencies SET rubric=_criteria,rubric_pass_mark=_pass_mark,rubric_version=rubric_version+1 WHERE id=_competency;
  RETURN competency.rubric_version+1;
END;
$$;

CREATE OR REPLACE FUNCTION public.assess_competency_rubric(_competency uuid,_learner uuid,_marks jsonb,_notes text,_expected_version integer)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE competency public.course_competencies; item jsonb; mark numeric; maximum numeric:=0; earned numeric:=0; score numeric; evidence_ref uuid;
BEGIN
  SELECT cc.* INTO competency FROM public.course_competencies cc JOIN public.studio_courses c ON c.id=cc.course_id
  WHERE cc.id=_competency AND c.author_id=auth.uid() AND c.revision_of IS NULL FOR UPDATE OF cc;
  IF NOT FOUND OR auth.uid() IS NULL THEN RAISE EXCEPTION 'Only the course author can assess rubrics'; END IF;
  IF _expected_version IS DISTINCT FROM competency.rubric_version THEN RAISE EXCEPTION 'Rubric changed. Refresh before grading'; END IF;
  IF competency.rubric_version=0 OR jsonb_array_length(competency.rubric)=0 THEN RAISE EXCEPTION 'Save a rubric before grading'; END IF;
  IF _marks IS NULL OR jsonb_typeof(_marks)<>'object' THEN RAISE EXCEPTION 'Invalid criterion scores'; END IF;
  IF (SELECT count(*) FROM jsonb_object_keys(_marks))<>jsonb_array_length(competency.rubric) THEN RAISE EXCEPTION 'Score every criterion exactly once'; END IF;
  FOR item IN SELECT value FROM jsonb_array_elements(competency.rubric) LOOP
    IF jsonb_typeof(_marks->(item->>'id')) IS DISTINCT FROM 'number' THEN RAISE EXCEPTION 'Missing criterion score'; END IF;
    mark := (_marks->>(item->>'id'))::numeric;
    IF mark<0 OR mark>(item->>'maxPoints')::numeric OR scale(mark)>2 THEN RAISE EXCEPTION 'Criterion score outside allowed range'; END IF;
    maximum := maximum+(item->>'maxPoints')::numeric;
    earned := earned+mark;
  END LOOP;
  score := round(earned/maximum*100,2);
  evidence_ref := public.record_competency_assessment(_competency,_learner,score>=competency.rubric_pass_mark,score,_notes);
  UPDATE public.learner_competency_evidence SET source_type='rubric' WHERE id=evidence_ref;
  INSERT INTO public.competency_rubric_assessments(evidence_id,criteria_snapshot,marks,total_points,max_points,pass_mark,rubric_version)
  VALUES(evidence_ref,competency.rubric,_marks,earned,maximum,competency.rubric_pass_mark,competency.rubric_version);
  RETURN evidence_ref;
END;
$$;
REVOKE ALL ON FUNCTION public.save_competency_rubric(uuid,jsonb,numeric,integer),public.assess_competency_rubric(uuid,uuid,jsonb,text,integer) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.save_competency_rubric(uuid,jsonb,numeric,integer),public.assess_competency_rubric(uuid,uuid,jsonb,text,integer) TO authenticated,service_role;

COMMIT;
