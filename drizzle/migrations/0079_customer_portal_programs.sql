BEGIN;
CREATE FUNCTION public.portal_program_available(_slug text,_version uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
  SELECT EXISTS(SELECT 1 FROM public.organization_portals p
    JOIN public.organization_cohorts oc ON oc.organization_id=p.organization_id
    JOIN public.cohort_members m ON m.cohort_id=oc.cohort_id AND m.user_id=auth.uid()
    JOIN public.cohort_program_assignments a ON a.cohort_id=oc.cohort_id AND a.active AND a.version_id=_version
    JOIN public.learning_program_versions v ON v.id=a.version_id
    WHERE p.slug=_slug AND p.enabled AND public.organization_access(p.organization_id)
      AND NOT EXISTS(SELECT 1 FROM public.organization_programs owner WHERE owner.program_id=v.program_id AND owner.organization_id<>p.organization_id)
      AND NOT EXISTS(SELECT 1 FROM jsonb_array_elements(v.stages) stage CROSS JOIN LATERAL jsonb_array_elements_text(stage->'course_ids') item
        JOIN public.organization_courses course_owner ON course_owner.course_id=item.value::uuid WHERE course_owner.organization_id<>p.organization_id))
$$;
CREATE FUNCTION public.portal_learning_programs(_slug text,_offset integer DEFAULT 0,_limit integer DEFAULT 24)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE org_ref uuid; total integer; records jsonb;
BEGIN
  SELECT organization_id INTO org_ref FROM public.organization_portals WHERE slug=_slug AND enabled;
  IF org_ref IS NULL OR NOT public.organization_access(org_ref) THEN RAISE EXCEPTION 'Your account needs membership in this training portal'; END IF;
  IF _offset IS NULL OR _offset<0 OR _limit IS NULL OR _limit NOT BETWEEN 1 AND 100 THEN RAISE EXCEPTION 'Choose a valid program page'; END IF;
  WITH matched AS(SELECT v.id,v.title,v.version,min(a.due_at) AS due_at FROM public.organization_cohorts oc
    JOIN public.cohort_members m ON m.cohort_id=oc.cohort_id AND m.user_id=auth.uid()
    JOIN public.cohort_program_assignments a ON a.cohort_id=oc.cohort_id AND a.active
    JOIN public.learning_program_versions v ON v.id=a.version_id WHERE oc.organization_id=org_ref AND public.portal_program_available(_slug,v.id) GROUP BY v.id,v.title,v.version),
  page AS(SELECT * FROM matched ORDER BY title,id OFFSET _offset LIMIT _limit)
  SELECT (SELECT count(*) FROM matched),coalesce((SELECT jsonb_agg(to_jsonb(page) ORDER BY title,id) FROM page),'[]'::jsonb) INTO total,records;
  RETURN jsonb_build_object('total',total,'records',records);
END;
$$;
CREATE FUNCTION public.portal_program_progress(_slug text,_version uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
  SELECT public.my_program_progress(_version) WHERE public.portal_program_available(_slug,_version)
$$;
CREATE FUNCTION public.claim_portal_program_award(_slug text,_version uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE org_ref uuid;
BEGIN
  SELECT organization_id INTO org_ref FROM public.organization_portals WHERE slug=_slug AND enabled FOR SHARE;
  IF NOT FOUND OR NOT public.portal_program_available(_slug,_version) THEN RAISE EXCEPTION 'An active program assignment in this training portal is required'; END IF;
  PERFORM 1 FROM public.organization_members WHERE organization_id=org_ref AND user_id=auth.uid() FOR SHARE;
  PERFORM 1 FROM public.cohort_members m JOIN public.organization_cohorts oc ON oc.cohort_id=m.cohort_id
    JOIN public.cohort_program_assignments a ON a.cohort_id=m.cohort_id AND a.active AND a.version_id=_version
    WHERE m.user_id=auth.uid() AND oc.organization_id=org_ref ORDER BY m.cohort_id FOR SHARE OF m,a;
  IF NOT FOUND OR NOT public.portal_program_available(_slug,_version) THEN RAISE EXCEPTION 'An active program assignment in this training portal is required'; END IF;
  RETURN public.claim_program_award(_version);
END;
$$;
REVOKE ALL ON FUNCTION public.portal_program_available(text,uuid) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.portal_learning_programs(text,integer,integer),public.portal_program_progress(text,uuid),public.claim_portal_program_award(text,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.portal_learning_programs(text,integer,integer),public.portal_program_progress(text,uuid),public.claim_portal_program_award(text,uuid) TO authenticated;
COMMIT;
