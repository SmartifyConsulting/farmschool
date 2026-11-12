BEGIN;
CREATE TABLE public.learning_programs (
  id uuid PRIMARY KEY, owner_id uuid NOT NULL, title text NOT NULL CHECK(char_length(btrim(title)) BETWEEN 3 AND 200),
  description text NOT NULL DEFAULT '' CHECK(char_length(description)<=5000), stages jsonb NOT NULL DEFAULT '[]', draft_version integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE TABLE public.learning_program_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), program_id uuid NOT NULL REFERENCES public.learning_programs(id), version integer NOT NULL,
  title text NOT NULL, description text NOT NULL, stages jsonb NOT NULL, published_at timestamptz NOT NULL DEFAULT clock_timestamp(), UNIQUE(program_id,version)
);
CREATE TABLE public.cohort_program_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), cohort_id uuid NOT NULL REFERENCES public.cohorts(id),
  version_id uuid NOT NULL REFERENCES public.learning_program_versions(id), due_at timestamptz, active boolean NOT NULL DEFAULT true,
  version integer NOT NULL DEFAULT 1, UNIQUE(cohort_id,version_id)
);
CREATE TABLE public.program_awards (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), version_id uuid NOT NULL REFERENCES public.learning_program_versions(id), user_id uuid NOT NULL,
  title text NOT NULL, issued_at timestamptz NOT NULL DEFAULT clock_timestamp(), expires_at timestamptz, evidence jsonb NOT NULL, evidence_digest text NOT NULL,
  UNIQUE(version_id,user_id,evidence_digest)
);
CREATE INDEX cohort_program_version ON public.cohort_program_assignments(version_id,cohort_id) WHERE active;
CREATE INDEX program_awards_user ON public.program_awards(user_id,version_id,issued_at DESC);
ALTER TABLE public.learning_programs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.learning_program_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cohort_program_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.program_awards ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.learning_programs,public.learning_program_versions,public.cohort_program_assignments,public.program_awards FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.learning_programs,public.learning_program_versions,public.cohort_program_assignments,public.program_awards TO authenticated;
GRANT ALL ON public.learning_programs,public.learning_program_versions,public.cohort_program_assignments,public.program_awards TO service_role;
CREATE FUNCTION public.program_version_visible(_version uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
  SELECT auth.uid() IS NOT NULL AND (EXISTS(SELECT 1 FROM public.learning_program_versions v JOIN public.learning_programs p ON p.id=v.program_id WHERE v.id=_version AND p.owner_id=auth.uid())
    OR EXISTS(SELECT 1 FROM public.cohort_program_assignments a JOIN public.cohort_members m ON m.cohort_id=a.cohort_id WHERE a.version_id=_version AND a.active AND m.user_id=auth.uid())
    OR EXISTS(SELECT 1 FROM public.cohort_program_assignments a WHERE a.version_id=_version AND a.active AND public.cohort_report_access(a.cohort_id)))
$$;
REVOKE ALL ON FUNCTION public.program_version_visible(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.program_version_visible(uuid) TO authenticated;
CREATE POLICY programs_owner_read ON public.learning_programs FOR SELECT TO authenticated USING(owner_id=auth.uid());
CREATE POLICY program_version_read ON public.learning_program_versions FOR SELECT TO authenticated USING(public.program_version_visible(id));
CREATE POLICY program_assignments_read ON public.cohort_program_assignments FOR SELECT TO authenticated USING(public.cohort_report_access(cohort_id) OR (active AND EXISTS(SELECT 1 FROM public.cohort_members m WHERE m.cohort_id=cohort_program_assignments.cohort_id AND m.user_id=auth.uid())));
CREATE POLICY program_awards_read ON public.program_awards FOR SELECT TO authenticated USING(user_id=auth.uid());

CREATE FUNCTION public.validate_program_stages(_stages jsonb)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE stage jsonb; course_count integer; course_ref uuid; seen uuid[]:='{}'; required integer;
BEGIN
  IF jsonb_typeof(_stages) IS DISTINCT FROM 'array' OR jsonb_array_length(_stages) NOT BETWEEN 1 AND 30 THEN RAISE EXCEPTION 'Add between 1 and 30 program stages'; END IF;
  FOR stage IN SELECT value FROM jsonb_array_elements(_stages) LOOP
    IF jsonb_typeof(stage) IS DISTINCT FROM 'object' OR coalesce(char_length(btrim(stage->>'title')),0) NOT BETWEEN 1 AND 200
      OR jsonb_typeof(stage->'course_ids') IS DISTINCT FROM 'array' OR jsonb_typeof(stage->'required') IS DISTINCT FROM 'number'
      OR (stage->>'required') !~ '^[1-9][0-9]*$' THEN RAISE EXCEPTION 'Each stage needs a title, courses and a whole-number completion requirement'; END IF;
    course_count:=jsonb_array_length(stage->'course_ids'); required:=(stage->>'required')::integer;
    IF course_count NOT BETWEEN 1 AND 100 OR required>course_count THEN RAISE EXCEPTION 'Choose a valid course requirement for each stage'; END IF;
    FOR course_ref IN SELECT value::uuid FROM jsonb_array_elements_text(stage->'course_ids') LOOP
      IF course_ref IS NULL OR course_ref=ANY(seen) THEN RAISE EXCEPTION 'Use each course only once in a program'; END IF;
      PERFORM 1 FROM public.studio_courses WHERE id=course_ref AND published AND revision_of IS NULL;
      IF NOT FOUND THEN RAISE EXCEPTION 'Program courses must be published'; END IF;
      seen:=array_append(seen,course_ref);
    END LOOP;
    IF cardinality(seen)>200 THEN RAISE EXCEPTION 'A program supports at most 200 courses'; END IF;
  END LOOP;
END;
$$;
REVOKE ALL ON FUNCTION public.validate_program_stages(jsonb) FROM PUBLIC,anon,authenticated;
CREATE FUNCTION public.save_learning_program(_program uuid,_title text,_description text,_stages jsonb,_expected integer)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE existing public.learning_programs;
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_role(auth.uid(),'admin') THEN RAISE EXCEPTION 'Administrator access required'; END IF;
  IF _program IS NULL OR _title IS NULL OR char_length(btrim(_title)) NOT BETWEEN 3 AND 200 OR _description IS NULL OR char_length(_description)>5000 THEN RAISE EXCEPTION 'Give the program a title and description'; END IF;
  PERFORM public.validate_program_stages(_stages);
  SELECT * INTO existing FROM public.learning_programs WHERE id=_program FOR UPDATE;
  IF FOUND THEN
    IF existing.owner_id<>auth.uid() OR existing.draft_version IS DISTINCT FROM _expected THEN RAISE EXCEPTION 'Program changed or is not yours. Refresh and try again'; END IF;
    UPDATE public.learning_programs SET title=btrim(_title),description=_description,stages=_stages,draft_version=draft_version+1 WHERE id=_program RETURNING draft_version INTO _expected;
  ELSE
    IF _expected IS DISTINCT FROM 0 THEN RAISE EXCEPTION 'Program not found'; END IF;
    INSERT INTO public.learning_programs(id,owner_id,title,description,stages) VALUES(_program,auth.uid(),btrim(_title),_description,_stages); _expected:=1;
  END IF;
  RETURN _expected;
END;
$$;
CREATE FUNCTION public.publish_learning_program(_program uuid,_expected integer)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE draft public.learning_programs; result uuid; revision integer;
BEGIN
  SELECT * INTO draft FROM public.learning_programs WHERE id=_program AND owner_id=auth.uid() FOR UPDATE;
  IF NOT FOUND OR NOT public.has_role(auth.uid(),'admin') OR draft.draft_version IS DISTINCT FROM _expected THEN RAISE EXCEPTION 'Program changed or is not yours. Save and refresh before publishing'; END IF;
  PERFORM 1 FROM public.studio_courses WHERE id IN(SELECT item.value::uuid FROM jsonb_array_elements(draft.stages) stage CROSS JOIN LATERAL jsonb_array_elements_text(stage->'course_ids') item) ORDER BY id FOR SHARE;
  PERFORM public.validate_program_stages(draft.stages);
  SELECT id INTO result FROM public.learning_program_versions WHERE program_id=_program AND title=draft.title AND description=draft.description AND stages=draft.stages ORDER BY version DESC LIMIT 1;
  IF FOUND THEN RETURN result; END IF;
  SELECT coalesce(max(version),0)+1 INTO revision FROM public.learning_program_versions WHERE program_id=_program;
  INSERT INTO public.learning_program_versions(program_id,version,title,description,stages) VALUES(_program,revision,draft.title,draft.description,draft.stages) RETURNING id INTO result;
  INSERT INTO public.audit_events(actor_id,action,entity_type,entity_id,metadata) VALUES(auth.uid(),'program.published','program',_program::text,jsonb_build_object('version',revision,'version_id',result));
  RETURN result;
END;
$$;
CREATE FUNCTION public.assign_cohort_program(_cohort uuid,_version uuid,_due timestamptz,_active boolean,_expected integer)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE current_version integer;
BEGIN
  PERFORM 1 FROM public.cohorts WHERE id=_cohort AND owner_id=auth.uid() FOR UPDATE;
  IF NOT FOUND OR NOT public.has_role(auth.uid(),'admin') THEN RAISE EXCEPTION 'Only the administrator who owns the cohort can assign programs'; END IF;
  IF _active IS NULL OR NOT EXISTS(SELECT 1 FROM public.learning_program_versions v JOIN public.learning_programs p ON p.id=v.program_id WHERE v.id=_version AND p.owner_id=auth.uid()) THEN RAISE EXCEPTION 'Choose a published version of your program'; END IF;
  SELECT version INTO current_version FROM public.cohort_program_assignments WHERE cohort_id=_cohort AND version_id=_version FOR UPDATE;
  IF coalesce(current_version,0) IS DISTINCT FROM _expected THEN RAISE EXCEPTION 'Program assignment changed. Refresh and try again'; END IF;
  INSERT INTO public.cohort_program_assignments(cohort_id,version_id,due_at,active) VALUES(_cohort,_version,_due,_active)
    ON CONFLICT(cohort_id,version_id) DO UPDATE SET due_at=excluded.due_at,active=excluded.active,version=cohort_program_assignments.version+1;
  INSERT INTO public.audit_events(actor_id,action,entity_type,entity_id,metadata) VALUES(auth.uid(),'program.cohort_assignment','cohort',_cohort::text,jsonb_build_object('version_id',_version,'due_at',_due,'active',_active));
END;
$$;
REVOKE ALL ON FUNCTION public.save_learning_program(uuid,text,text,jsonb,integer),public.publish_learning_program(uuid,integer),public.assign_cohort_program(uuid,uuid,timestamptz,boolean,integer) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.save_learning_program(uuid,text,text,jsonb,integer),public.publish_learning_program(uuid,integer),public.assign_cohort_program(uuid,uuid,timestamptz,boolean,integer) TO authenticated;

CREATE FUNCTION public.program_progress(_version uuid,_user uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE snapshot public.learning_program_versions; stage jsonb; stages jsonb:='[]'; courses jsonb; completed integer; required integer; all_complete boolean:=true;
BEGIN
  SELECT * INTO snapshot FROM public.learning_program_versions WHERE id=_version;
  IF NOT FOUND THEN RETURN NULL; END IF;
  FOR stage IN SELECT value FROM jsonb_array_elements(snapshot.stages) LOOP
    SELECT jsonb_agg(jsonb_build_object('id',course.id,'title',course.title,'published',course.published,'complete',cert.id IS NOT NULL,'certificate_id',cert.id,'expires_at',public.certificate_effective_expiry(cert.id)) ORDER BY item.ordinality),count(cert.id)
      INTO courses,completed FROM jsonb_array_elements_text(stage->'course_ids') WITH ORDINALITY item(value,ordinality)
      JOIN public.studio_courses course ON course.id=item.value::uuid
      LEFT JOIN public.certificates cert ON cert.user_id=_user AND cert.source='studio' AND cert.course_ref=course.id::text AND cert.validated_at IS NOT NULL AND public.certificate_is_current(cert.id);
    required:=(stage->>'required')::integer;
    stages:=stages||jsonb_build_array(jsonb_build_object('title',stage->>'title','required',required,'completed',completed,'unlocked',all_complete,'courses',coalesce(courses,'[]')));
    all_complete:=all_complete AND completed>=required;
  END LOOP;
  RETURN jsonb_build_object('id',snapshot.id,'title',snapshot.title,'description',snapshot.description,'version',snapshot.version,'stages',stages,'complete',all_complete);
END;
$$;
REVOKE ALL ON FUNCTION public.program_progress(uuid,uuid) FROM PUBLIC,anon,authenticated;
CREATE FUNCTION public.my_learning_programs()
RETURNS TABLE(id uuid,title text,version integer,due_at timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
  SELECT v.id,v.title,v.version,min(a.due_at) FROM public.learning_program_versions v JOIN public.cohort_program_assignments a ON a.version_id=v.id AND a.active
    JOIN public.cohort_members m ON m.cohort_id=a.cohort_id AND m.user_id=auth.uid() GROUP BY v.id,v.title,v.version
$$;
CREATE FUNCTION public.my_program_progress(_version uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
  SELECT public.program_progress(_version,auth.uid())||jsonb_build_object('awards',coalesce((SELECT jsonb_agg(jsonb_build_object('id',a.id,'issued_at',a.issued_at,'expires_at',a.expires_at) ORDER BY a.issued_at DESC,a.id) FROM public.program_awards a WHERE a.version_id=_version AND a.user_id=auth.uid()),'[]'::jsonb))
  WHERE public.program_version_visible(_version)
$$;
CREATE FUNCTION public.claim_program_award(_version uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE snapshot public.learning_program_versions; progress jsonb; evidence jsonb; expiry timestamptz; digest text; result uuid;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Sign in before claiming program completion'; END IF;
  SELECT * INTO snapshot FROM public.learning_program_versions WHERE id=_version FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Program not found'; END IF;
  PERFORM 1 FROM public.cohort_members m JOIN public.cohort_program_assignments a ON a.cohort_id=m.cohort_id
    WHERE m.user_id=auth.uid() AND a.version_id=_version AND a.active ORDER BY m.cohort_id FOR SHARE OF m,a;
  IF NOT FOUND THEN RAISE EXCEPTION 'An active cohort program assignment is required'; END IF;
  PERFORM 1 FROM public.studio_courses WHERE id IN(SELECT item.value::uuid FROM jsonb_array_elements(snapshot.stages) stage CROSS JOIN LATERAL jsonb_array_elements_text(stage->'course_ids') item) ORDER BY id FOR SHARE;
  PERFORM 1 FROM public.certificates WHERE user_id=auth.uid() AND source='studio' AND course_ref IN(SELECT item.value FROM jsonb_array_elements(snapshot.stages) stage CROSS JOIN LATERAL jsonb_array_elements_text(stage->'course_ids') item) ORDER BY id FOR SHARE;
  progress:=public.program_progress(_version,auth.uid());
  IF NOT coalesce((progress->>'complete')::boolean,false) THEN RAISE EXCEPTION 'Earn current verified certificates for every required program stage first'; END IF;
  SELECT jsonb_agg(jsonb_build_object('certificate_id',c.id,'course_ref',c.course_ref,'expires_at',public.certificate_effective_expiry(c.id),
      'renewal_id',(SELECT r.id FROM public.certificate_renewals r WHERE r.certificate_id=c.id AND r.completed_at IS NOT NULL ORDER BY r.completed_at DESC,r.id LIMIT 1)) ORDER BY c.id),min(public.certificate_effective_expiry(c.id))
    INTO evidence,expiry FROM public.certificates c WHERE c.user_id=auth.uid() AND c.source='studio' AND c.validated_at IS NOT NULL AND public.certificate_is_current(c.id)
      AND c.course_ref IN(SELECT picked.course->>'id' FROM jsonb_array_elements(progress->'stages') stage CROSS JOIN LATERAL
        (SELECT course FROM jsonb_array_elements(stage->'courses') WITH ORDINALITY entry(course,position) WHERE (course->>'complete')::boolean ORDER BY position LIMIT (stage->>'required')::integer) picked);
  digest:=md5(evidence::text);
  INSERT INTO public.program_awards(version_id,user_id,title,expires_at,evidence,evidence_digest) VALUES(_version,auth.uid(),snapshot.title,expiry,evidence,digest)
    ON CONFLICT(version_id,user_id,evidence_digest) DO NOTHING RETURNING id INTO result;
  IF result IS NULL THEN SELECT id INTO result FROM public.program_awards WHERE version_id=_version AND user_id=auth.uid() AND evidence_digest=digest; END IF;
  RETURN result;
END;
$$;
REVOKE ALL ON FUNCTION public.my_learning_programs(),public.my_program_progress(uuid),public.claim_program_award(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.my_learning_programs(),public.my_program_progress(uuid),public.claim_program_award(uuid) TO authenticated;
CREATE FUNCTION public.cohort_program_progress(_cohort uuid,_version uuid)
RETURNS TABLE(user_id uuid,full_name text,complete boolean,completed_stages bigint,total_stages integer)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
BEGIN
  IF NOT public.cohort_report_access(_cohort) OR NOT EXISTS(SELECT 1 FROM public.cohort_program_assignments WHERE cohort_id=_cohort AND version_id=_version) THEN RAISE EXCEPTION 'Scoped program reporting access required'; END IF;
  RETURN QUERY SELECT m.user_id,coalesce(nullif(p.full_name,''),'Learner'),(progress.value->>'complete')::boolean,
    (SELECT count(*) FROM jsonb_array_elements(progress.value->'stages') s WHERE (s->>'completed')::integer>=(s->>'required')::integer),jsonb_array_length(progress.value->'stages')
    FROM public.cohort_members m LEFT JOIN public.profiles p ON p.user_id=m.user_id CROSS JOIN LATERAL (SELECT public.program_progress(_version,m.user_id) AS value) progress
    WHERE m.cohort_id=_cohort;
END;
$$;
REVOKE ALL ON FUNCTION public.cohort_program_progress(uuid,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.cohort_program_progress(uuid,uuid) TO authenticated;
CREATE FUNCTION public.cohort_program_versions(_cohort uuid)
RETURNS TABLE(id uuid,title text,version integer,active boolean,due_at timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
  SELECT v.id,v.title,v.version,a.active,a.due_at FROM public.cohort_program_assignments a JOIN public.learning_program_versions v ON v.id=a.version_id
  WHERE a.cohort_id=_cohort AND public.cohort_report_access(_cohort)
$$;
REVOKE ALL ON FUNCTION public.cohort_program_versions(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.cohort_program_versions(uuid) TO authenticated;
COMMIT;
