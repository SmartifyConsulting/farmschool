BEGIN;

CREATE TABLE public.course_grading_schemes (
  course_id uuid PRIMARY KEY REFERENCES public.studio_courses(id) ON DELETE CASCADE,
  version integer NOT NULL DEFAULT 1,
  categories jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.course_grade_decisions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id uuid NOT NULL REFERENCES public.studio_courses(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  proposed_by uuid NOT NULL,
  proposed_at timestamptz NOT NULL DEFAULT now(),
  score numeric NOT NULL CHECK(score BETWEEN 0 AND 100 AND score=round(score,2)),
  reason text NOT NULL CHECK(char_length(btrim(reason)) BETWEEN 20 AND 2000),
  scheme_version integer NOT NULL,
  previous_decision uuid REFERENCES public.course_grade_decisions(id),
  status text NOT NULL DEFAULT 'pending' CHECK(status IN('pending','approved','rejected')),
  reviewed_by uuid,
  reviewed_at timestamptz,
  review_note text,
  CHECK((status='pending' AND reviewed_by IS NULL AND reviewed_at IS NULL AND review_note IS NULL)
    OR (status<>'pending' AND reviewed_by IS NOT NULL AND reviewed_by<>proposed_by AND reviewed_at IS NOT NULL AND review_note IS NOT NULL AND char_length(btrim(review_note)) BETWEEN 20 AND 2000))
);
CREATE UNIQUE INDEX course_grade_one_pending ON public.course_grade_decisions(course_id,user_id) WHERE status='pending';
CREATE INDEX course_grade_latest ON public.course_grade_decisions(course_id,user_id,reviewed_at DESC,id) WHERE status='approved';
ALTER TABLE public.course_grading_schemes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.course_grade_decisions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.course_grading_schemes,public.course_grade_decisions FROM anon,authenticated;
GRANT SELECT ON public.course_grading_schemes,public.course_grade_decisions TO authenticated;
CREATE POLICY grading_scheme_read ON public.course_grading_schemes FOR SELECT TO authenticated USING(public.studio_course_visible(course_id));
CREATE POLICY grade_decision_read ON public.course_grade_decisions FOR SELECT TO authenticated USING(
  user_id=auth.uid() OR public.has_role(auth.uid(),'admin') OR EXISTS(SELECT 1 FROM public.studio_courses c WHERE c.id=course_id AND c.author_id=auth.uid())
);

CREATE FUNCTION public.save_course_grading(_course uuid,_categories jsonb,_expected_version integer)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE category jsonb; item jsonb; weight_sum numeric:=0; ids text[]:='{}'; category_ids text[]:='{}'; item_key text; current_version integer;
BEGIN
  PERFORM 1 FROM public.studio_courses WHERE id=_course AND author_id=auth.uid() AND revision_of IS NULL FOR UPDATE;
  IF NOT FOUND OR auth.uid() IS NULL THEN RAISE EXCEPTION 'Only the course owner can configure grading'; END IF;
  IF jsonb_typeof(_categories) IS DISTINCT FROM 'array' OR jsonb_array_length(_categories) NOT BETWEEN 1 AND 20 THEN RAISE EXCEPTION 'Add 1 to 20 grading categories'; END IF;
  SELECT version INTO current_version FROM public.course_grading_schemes WHERE course_id=_course;
  IF _expected_version IS DISTINCT FROM coalesce(current_version,0) THEN RAISE EXCEPTION 'Grading configuration changed. Refresh before saving'; END IF;
  FOR category IN SELECT value FROM jsonb_array_elements(_categories) LOOP
    IF jsonb_typeof(category) IS DISTINCT FROM 'object' OR coalesce(category->>'id','') !~* '^[0-9a-f-]{36}$'
      OR jsonb_typeof(category->'title') IS DISTINCT FROM 'string' OR char_length(btrim(category->>'title')) NOT BETWEEN 1 AND 100
      OR jsonb_typeof(category->'weight') IS DISTINCT FROM 'number' OR (category->>'weight')::numeric<=0 OR (category->>'weight')::numeric>100
      OR (category->>'weight')::numeric<>round((category->>'weight')::numeric,2)
      OR jsonb_typeof(category->'items') IS DISTINCT FROM 'array' OR jsonb_array_length(category->'items') NOT BETWEEN 1 AND 100 THEN RAISE EXCEPTION 'Check category titles, weights and items'; END IF;
    IF category->>'id'=ANY(category_ids) THEN RAISE EXCEPTION 'Category identifiers must be unique'; END IF;
    category_ids:=array_append(category_ids,category->>'id');
    weight_sum:=weight_sum+(category->>'weight')::numeric;
    FOR item IN SELECT value FROM jsonb_array_elements(category->'items') LOOP
      item_key:=(item->>'kind')||':'||(item->>'id');
      IF item_key IS NULL OR item_key=ANY(ids) THEN RAISE EXCEPTION 'Choose each grading item only once'; END IF;
      IF item->>'kind'='quiz' THEN
        IF NOT EXISTS(SELECT 1 FROM public.studio_lessons WHERE course_id=_course AND id::text=item->>'id' AND kind='quiz') THEN RAISE EXCEPTION 'Choose a quiz from this course'; END IF;
      ELSIF item->>'kind'='competency' THEN
        IF NOT EXISTS(SELECT 1 FROM public.course_competencies WHERE course_id=_course AND id::text=item->>'id') THEN RAISE EXCEPTION 'Choose a competency from this course'; END IF;
      ELSE RAISE EXCEPTION 'Choose a quiz or competency'; END IF;
      ids:=array_append(ids,item_key);
    END LOOP;
  END LOOP;
  IF weight_sum<>100 THEN RAISE EXCEPTION 'Category weights must total 100 percent'; END IF;
  INSERT INTO public.course_grading_schemes(course_id,version,categories) VALUES(_course,1,_categories)
    ON CONFLICT(course_id) DO UPDATE SET version=public.course_grading_schemes.version+1,categories=excluded.categories,updated_at=clock_timestamp()
    RETURNING version INTO current_version;
  RETURN current_version;
END;
$$;

CREATE FUNCTION public.propose_course_grade(_course uuid,_learner uuid,_score numeric,_reason text,_expected_version integer,_previous_decision uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE latest uuid; scheme integer; result uuid;
BEGIN
  PERFORM 1 FROM public.studio_courses WHERE id=_course AND author_id=auth.uid() AND revision_of IS NULL FOR UPDATE;
  IF NOT FOUND OR auth.uid() IS NULL THEN RAISE EXCEPTION 'Only the course owner can propose a grade'; END IF;
  SELECT version INTO scheme FROM public.course_grading_schemes WHERE course_id=_course;
  IF _expected_version IS DISTINCT FROM coalesce(scheme,0) THEN RAISE EXCEPTION 'Grading configuration changed. Refresh before proposing'; END IF;
  IF _learner IS NULL OR _score IS NULL OR _score NOT BETWEEN 0 AND 100 OR _score<>round(_score,2) OR _reason IS NULL OR char_length(btrim(_reason)) NOT BETWEEN 20 AND 2000 THEN RAISE EXCEPTION 'Enter a score and a reason of 20 to 2000 characters'; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.course_assessment_learners(_course) l WHERE l.user_id=_learner) THEN RAISE EXCEPTION 'Choose a learner with access to this course'; END IF;
  SELECT id INTO latest FROM public.course_grade_decisions WHERE course_id=_course AND user_id=_learner AND status='approved' ORDER BY reviewed_at DESC,id DESC LIMIT 1;
  IF _previous_decision IS DISTINCT FROM latest THEN RAISE EXCEPTION 'The approved grade changed. Refresh before proposing'; END IF;
  INSERT INTO public.course_grade_decisions(course_id,user_id,proposed_by,score,reason,scheme_version,previous_decision)
    VALUES(_course,_learner,auth.uid(),_score,btrim(_reason),coalesce(scheme,0),latest) RETURNING id INTO result;
  RETURN result;
END;
$$;

CREATE FUNCTION public.review_course_grade(_decision uuid,_approve boolean,_note text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE proposal public.course_grade_decisions; latest uuid; scheme integer;
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_role(auth.uid(),'admin') THEN RAISE EXCEPTION 'An administrator must review this grade'; END IF;
  SELECT * INTO proposal FROM public.course_grade_decisions WHERE id=_decision;
  IF NOT FOUND THEN RAISE EXCEPTION 'Grade proposal not found'; END IF;
  PERFORM 1 FROM public.studio_courses WHERE id=proposal.course_id FOR UPDATE;
  SELECT * INTO proposal FROM public.course_grade_decisions WHERE id=_decision FOR UPDATE;
  IF proposal.status<>'pending' OR proposal.proposed_by=auth.uid() THEN RAISE EXCEPTION 'A different administrator must review a pending proposal'; END IF;
  IF _approve IS NULL OR _note IS NULL OR char_length(btrim(_note)) NOT BETWEEN 20 AND 2000 THEN RAISE EXCEPTION 'Give a review note of 20 to 2000 characters'; END IF;
  IF _approve THEN
    SELECT version INTO scheme FROM public.course_grading_schemes WHERE course_id=proposal.course_id;
    SELECT id INTO latest FROM public.course_grade_decisions WHERE course_id=proposal.course_id AND user_id=proposal.user_id AND status='approved' ORDER BY reviewed_at DESC,id DESC LIMIT 1;
    IF proposal.scheme_version<>coalesce(scheme,0) OR proposal.previous_decision IS DISTINCT FROM latest THEN RAISE EXCEPTION 'The grading basis changed. Reject this proposal and request a fresh one'; END IF;
  END IF;
  UPDATE public.course_grade_decisions SET status=CASE WHEN _approve THEN 'approved' ELSE 'rejected' END,reviewed_by=auth.uid(),reviewed_at=clock_timestamp(),review_note=btrim(_note) WHERE id=_decision;
END;
$$;

ALTER FUNCTION public.course_gradebook(uuid,integer,integer) RENAME TO course_gradebook_base;
REVOKE ALL ON FUNCTION public.course_gradebook_base(uuid,integer,integer) FROM PUBLIC,anon,authenticated,service_role;
CREATE FUNCTION public.course_gradebook(_course uuid,_offset integer DEFAULT 0,_limit integer DEFAULT 50)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE report jsonb; scheme public.course_grading_schemes; learner jsonb; category jsonb; item jsonb; learners jsonb:='[]';
  category_scores jsonb; points numeric; item_score numeric; weighted numeric; complete boolean; decision public.course_grade_decisions; head uuid;
BEGIN
  report:=public.course_gradebook_base(_course,_offset,_limit);
  SELECT * INTO scheme FROM public.course_grading_schemes WHERE course_id=_course;
  FOR learner IN SELECT value FROM jsonb_array_elements(report->'learners') LOOP
    category_scores:='[]'; weighted:=0; complete:=scheme.course_id IS NOT NULL;
    FOR category IN SELECT value FROM jsonb_array_elements(coalesce(scheme.categories,'[]')) LOOP
      points:=0;
      FOR item IN SELECT value FROM jsonb_array_elements(category->'items') LOOP
        item_score:=NULL;
        IF item->>'kind'='quiz' AND EXISTS(SELECT 1 FROM public.studio_lessons WHERE course_id=_course AND id::text=item->>'id' AND kind='quiz') THEN item_score:=(learner->'quizScores'->(item->>'id')->>'score')::numeric;
        ELSIF item->>'kind'='competency' AND EXISTS(SELECT 1 FROM public.course_competencies WHERE course_id=_course AND id::text=item->>'id') THEN item_score:=(learner->'competencyScores'->(item->>'id')->>'score')::numeric; END IF;
        IF item_score IS NULL THEN complete:=false; points:=NULL; ELSE points:=points+item_score; END IF;
      END LOOP;
      category_scores:=category_scores||jsonb_build_array(jsonb_build_object('id',category->>'id','title',category->>'title','score',round(points/jsonb_array_length(category->'items'),2),'weight',category->'weight'));
      weighted:=weighted+(points/jsonb_array_length(category->'items'))*(category->>'weight')::numeric/100;
    END LOOP;
    SELECT id INTO head FROM public.course_grade_decisions WHERE course_id=_course AND user_id=(learner->>'userId')::uuid AND status='approved' ORDER BY reviewed_at DESC,id DESC LIMIT 1;
    SELECT * INTO decision FROM public.course_grade_decisions WHERE id=head AND scheme_version=coalesce(scheme.version,0);
    learners:=learners||jsonb_build_array(learner||jsonb_build_object('finalGrade',jsonb_build_object('calculated',CASE WHEN complete THEN round(weighted,2) ELSE NULL END,'score',coalesce(decision.score,CASE WHEN complete THEN round(weighted,2) ELSE NULL END),'decisionId',decision.id,'headId',head,'overridden',decision.id IS NOT NULL,'categories',category_scores)));
  END LOOP;
  RETURN report||jsonb_build_object('grading',jsonb_build_object('version',coalesce(scheme.version,0),'categories',coalesce(scheme.categories,'[]')),'learners',learners);
END;
$$;

CREATE FUNCTION public.course_gradebook_export(_course uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE report jsonb; page jsonb; learners jsonb; next_offset integer:=200;
BEGIN
  report:=public.course_gradebook(_course,0,200);
  IF (report->>'total')::integer>10000 THEN RAISE EXCEPTION 'This course exceeds the export limit. Contact support for a managed export'; END IF;
  learners:=report->'learners';
  WHILE next_offset<(report->>'total')::integer LOOP
    page:=public.course_gradebook(_course,next_offset,200);
    learners:=learners||(page->'learners'); next_offset:=next_offset+200;
  END LOOP;
  IF jsonb_array_length(learners)<>(report->>'total')::integer THEN RAISE EXCEPTION 'Incomplete grade export'; END IF;
  RETURN report||jsonb_build_object('learners',learners,'offset',0,'limit',greatest(1,(report->>'total')::integer));
END;
$$;
REVOKE ALL ON FUNCTION public.save_course_grading(uuid,jsonb,integer),public.propose_course_grade(uuid,uuid,numeric,text,integer,uuid),public.review_course_grade(uuid,boolean,text),public.course_gradebook(uuid,integer,integer),public.course_gradebook_export(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.save_course_grading(uuid,jsonb,integer),public.propose_course_grade(uuid,uuid,numeric,text,integer,uuid),public.review_course_grade(uuid,boolean,text),public.course_gradebook(uuid,integer,integer),public.course_gradebook_export(uuid) TO authenticated,service_role;

CREATE FUNCTION public.grade_moderation_queue(_offset integer DEFAULT 0)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE records jsonb; total integer;
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_role(auth.uid(),'admin') THEN RAISE EXCEPTION 'Administrator access required'; END IF;
  IF _offset IS NULL OR _offset<0 THEN RAISE EXCEPTION 'Invalid moderation page'; END IF;
  SELECT count(*) INTO total FROM public.course_grade_decisions WHERE status='pending';
  SELECT coalesce(jsonb_agg(to_jsonb(page) ORDER BY page.proposed_at,page.id),'[]') INTO records FROM (
    SELECT d.id,d.course_id,d.user_id,d.score,d.reason,d.proposed_at,d.proposed_by,d.scheme_version,c.title,
      coalesce(nullif(p.full_name,''),'Learner') AS learner_name,coalesce(nullif(a.full_name,''),'Course author') AS author_name
    FROM public.course_grade_decisions d JOIN public.studio_courses c ON c.id=d.course_id
    LEFT JOIN public.profiles p ON p.user_id=d.user_id LEFT JOIN public.profiles a ON a.user_id=d.proposed_by
    WHERE d.status='pending' ORDER BY d.proposed_at,d.id OFFSET _offset LIMIT 50
  ) page;
  RETURN jsonb_build_object('records',records,'total',total);
END;
$$;
REVOKE ALL ON FUNCTION public.grade_moderation_queue(integer) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.grade_moderation_queue(integer) TO authenticated;

COMMIT;
