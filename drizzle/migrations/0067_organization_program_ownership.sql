BEGIN;
CREATE TABLE public.organization_programs (
  program_id uuid PRIMARY KEY REFERENCES public.learning_programs(id), organization_id uuid NOT NULL REFERENCES public.organizations(id)
);
CREATE INDEX organization_programs_scope ON public.organization_programs(organization_id,program_id);
ALTER TABLE public.organization_programs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.organization_programs FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.organization_programs TO authenticated;
GRANT ALL ON public.organization_programs TO service_role;
CREATE POLICY organization_program_managers_read ON public.organization_programs FOR SELECT TO authenticated USING(public.organization_manage(organization_id));
CREATE FUNCTION public.program_management_access(_program uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
  SELECT EXISTS(SELECT 1 FROM public.learning_programs p LEFT JOIN public.organization_programs op ON op.program_id=p.id WHERE p.id=_program AND
    CASE WHEN op.organization_id IS NULL THEN p.owner_id=auth.uid() AND public.has_role(auth.uid(),'admin') ELSE public.organization_manage(op.organization_id) END)
$$;
CREATE FUNCTION public.program_company_boundary(_program uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
  SELECT NOT EXISTS(SELECT 1 FROM public.organization_programs op WHERE op.program_id=_program AND NOT public.organization_manage(op.organization_id))
$$;
REVOKE ALL ON FUNCTION public.program_management_access(uuid),public.program_company_boundary(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.program_management_access(uuid),public.program_company_boundary(uuid) TO authenticated;
CREATE POLICY program_company_draft_boundary ON public.learning_programs AS RESTRICTIVE FOR SELECT TO authenticated USING(public.program_company_boundary(id));
CREATE POLICY organization_managers_read_programs ON public.learning_programs FOR SELECT TO authenticated USING(public.program_management_access(id));
CREATE FUNCTION public.validate_program_company_scope(_program uuid,_stages jsonb)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
  IF EXISTS(SELECT 1 FROM public.organization_programs op CROSS JOIN LATERAL jsonb_array_elements(_stages) stage
    CROSS JOIN LATERAL jsonb_array_elements_text(stage->'course_ids') item JOIN public.organization_courses oc ON oc.course_id=item.value::uuid
    WHERE op.program_id=_program AND oc.organization_id<>op.organization_id) THEN RAISE EXCEPTION 'Organization programs can include public courses and private courses in their own organization'; END IF;
END;
$$;
REVOKE ALL ON FUNCTION public.validate_program_company_scope(uuid,jsonb) FROM PUBLIC,anon,authenticated;
DO $program_management$
DECLARE definition text; old text;
BEGIN
  SELECT pg_get_functiondef('public.save_learning_program(uuid,text,text,jsonb,integer)'::regprocedure) INTO definition;
  old:='NOT public.has_role(auth.uid(),''admin'')';
  IF strpos(definition,old)=0 OR strpos(definition,'existing.owner_id<>auth.uid()')=0 THEN RAISE EXCEPTION 'Unexpected program draft management definition'; END IF;
  definition:=replace(definition,old,'NOT (public.has_role(auth.uid(),''admin'') OR public.program_management_access(_program))');
  definition:=replace(definition,'existing.owner_id<>auth.uid()','NOT public.program_management_access(_program)');
  definition:=replace(definition,'PERFORM public.validate_program_stages(_stages);','PERFORM public.validate_program_stages(_stages); PERFORM public.validate_program_company_scope(_program,_stages);');
  definition:=replace(definition,'  RETURN _expected;','  INSERT INTO public.audit_events(actor_id,action,entity_type,entity_id,metadata) VALUES(auth.uid(),''program.draft_saved'',''program'',_program::text,jsonb_build_object(''draft_version'',_expected)); RETURN _expected;');
  EXECUTE definition;
  SELECT pg_get_functiondef('public.publish_learning_program(uuid,integer)'::regprocedure) INTO definition;
  old:='WHERE id=_program AND owner_id=auth.uid() FOR UPDATE;';
  IF strpos(definition,old)=0 THEN RAISE EXCEPTION 'Unexpected program publishing definition'; END IF;
  definition:=replace(definition,old,'WHERE id=_program AND public.program_management_access(id) FOR UPDATE;');
  definition:=replace(definition,'NOT public.has_role(auth.uid(),''admin'')','NOT public.program_management_access(_program)');
  definition:=replace(definition,'PERFORM public.validate_program_stages(draft.stages);','PERFORM public.validate_program_stages(draft.stages); PERFORM public.validate_program_company_scope(_program,draft.stages);');
  EXECUTE definition;
  SELECT pg_get_functiondef('public.cohort_organization_guard()'::regprocedure) INTO definition;
  old:='    SELECT stages INTO version_stages FROM public.learning_program_versions WHERE id=NEW.version_id;';
  IF strpos(definition,old)=0 THEN RAISE EXCEPTION 'Unexpected program cohort boundary guard'; END IF;
  EXECUTE replace(definition,old,old||E'\n'||'    IF EXISTS(SELECT 1 FROM public.learning_program_versions v JOIN public.organization_programs op ON op.program_id=v.program_id WHERE v.id=NEW.version_id AND op.organization_id IS DISTINCT FROM (SELECT organization_id FROM public.organization_cohorts WHERE cohort_id=NEW.cohort_id)) THEN RAISE EXCEPTION ''Company programs require a cohort in the same organization''; END IF;');
  SELECT pg_get_functiondef('public.program_progress(uuid,uuid)'::regprocedure) INTO definition;
  old:='''title'',course.title,''published'',course.published';
  IF strpos(definition,old)=0 OR strpos(definition,'AND public.certificate_is_current(cert.id);')=0 THEN RAISE EXCEPTION 'Unexpected program progress metadata definition'; END IF;
  definition:=replace(definition,old,'''title'',CASE WHEN course.published AND public.course_organization_access(course.id,_user) THEN course.title ELSE coalesce(cert.title,''Unavailable course'') END,''published'',course.published AND public.course_organization_access(course.id,_user)');
  definition:=replace(definition,'AND public.certificate_is_current(cert.id);','AND public.certificate_is_current(cert.id) AND public.course_organization_access(course.id,_user);');
  EXECUTE definition;
END;
$program_management$;
CREATE OR REPLACE FUNCTION public.program_version_visible(_version uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
  SELECT auth.uid() IS NOT NULL AND (EXISTS(SELECT 1 FROM public.learning_program_versions v JOIN public.learning_programs p ON p.id=v.program_id WHERE v.id=_version AND
      ((p.owner_id=auth.uid() AND public.program_company_boundary(p.id)) OR public.program_management_access(p.id)))
    OR EXISTS(SELECT 1 FROM public.cohort_program_assignments a JOIN public.cohort_members m ON m.cohort_id=a.cohort_id WHERE a.version_id=_version AND a.active AND m.user_id=auth.uid())
    OR EXISTS(SELECT 1 FROM public.cohort_program_assignments a WHERE a.version_id=_version AND a.active AND public.cohort_report_access(a.cohort_id)))
$$;
CREATE FUNCTION public.save_organization_program(_organization uuid,_program uuid,_title text,_description text,_stages jsonb,_expected integer)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
  PERFORM 1 FROM public.organizations WHERE id=_organization FOR UPDATE;
  IF NOT FOUND OR NOT public.organization_manage(_organization) THEN RAISE EXCEPTION 'Organization program management access required'; END IF;
  PERFORM public.validate_program_stages(_stages);
  IF _program IS NULL OR _title IS NULL OR char_length(btrim(_title)) NOT BETWEEN 3 AND 200 OR _description IS NULL OR char_length(_description)>5000 THEN RAISE EXCEPTION 'Give valid program details'; END IF;
  IF EXISTS(SELECT 1 FROM public.learning_programs WHERE id=_program) THEN
    IF NOT EXISTS(SELECT 1 FROM public.organization_programs WHERE program_id=_program AND organization_id=_organization) THEN RAISE EXCEPTION 'Choose a program owned by this organization'; END IF;
    RETURN public.save_learning_program(_program,_title,_description,_stages,_expected);
  END IF;
  IF _expected IS DISTINCT FROM 0 THEN RAISE EXCEPTION 'Program not found'; END IF;
  INSERT INTO public.learning_programs(id,owner_id,title,description,stages) VALUES(_program,auth.uid(),btrim(_title),_description,_stages);
  INSERT INTO public.organization_programs(program_id,organization_id) VALUES(_program,_organization);
  PERFORM public.validate_program_company_scope(_program,_stages);
  INSERT INTO public.audit_events(actor_id,action,entity_type,entity_id,metadata) VALUES(auth.uid(),'organization.program_created','program',_program::text,jsonb_build_object('organization_id',_organization));
  RETURN 1;
END;
$$;
CREATE FUNCTION public.assign_organization_program(_cohort uuid,_version uuid,_due timestamptz,_active boolean,_expected integer)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE org_ref uuid; existing_version integer;
BEGIN
  org_ref:=public.organization_cohort_manage(_cohort);
  PERFORM 1 FROM public.cohorts WHERE id=_cohort FOR UPDATE;
  IF _active IS NULL OR NOT EXISTS(SELECT 1 FROM public.learning_program_versions v JOIN public.organization_programs op ON op.program_id=v.program_id WHERE v.id=_version AND op.organization_id=org_ref) THEN RAISE EXCEPTION 'Choose a published program owned by the cohort organization'; END IF;
  SELECT version INTO existing_version FROM public.cohort_program_assignments WHERE cohort_id=_cohort AND version_id=_version FOR UPDATE;
  IF coalesce(existing_version,0) IS DISTINCT FROM _expected THEN RAISE EXCEPTION 'Program assignment changed. Refresh before saving'; END IF;
  INSERT INTO public.cohort_program_assignments(cohort_id,version_id,due_at,active) VALUES(_cohort,_version,_due,_active)
    ON CONFLICT(cohort_id,version_id) DO UPDATE SET due_at=excluded.due_at,active=excluded.active,version=cohort_program_assignments.version+1;
  INSERT INTO public.audit_events(actor_id,action,entity_type,entity_id,metadata) VALUES(auth.uid(),'organization.program_assigned','cohort',_cohort::text,jsonb_build_object('version_id',_version,'active',_active,'due_at',_due));
END;
$$;
CREATE FUNCTION public.organization_program_drafts(_organization uuid)
RETURNS SETOF public.learning_programs LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
  SELECT p.* FROM public.learning_programs p JOIN public.organization_programs op ON op.program_id=p.id WHERE op.organization_id=_organization AND public.organization_manage(_organization)
$$;
CREATE FUNCTION public.organization_program_versions(_organization uuid)
RETURNS SETOF public.learning_program_versions LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
  SELECT v.* FROM public.learning_program_versions v JOIN public.organization_programs op ON op.program_id=v.program_id WHERE op.organization_id=_organization AND public.organization_manage(_organization)
$$;
CREATE FUNCTION public.organization_program_assignments(_organization uuid)
RETURNS SETOF public.cohort_program_assignments LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
  SELECT a.* FROM public.cohort_program_assignments a JOIN public.organization_cohorts oc ON oc.cohort_id=a.cohort_id JOIN public.learning_program_versions v ON v.id=a.version_id JOIN public.organization_programs op ON op.program_id=v.program_id
  WHERE oc.organization_id=_organization AND op.organization_id=_organization AND public.organization_manage(_organization)
$$;
REVOKE ALL ON FUNCTION public.save_organization_program(uuid,uuid,text,text,jsonb,integer),public.assign_organization_program(uuid,uuid,timestamptz,boolean,integer),public.organization_program_drafts(uuid),public.organization_program_versions(uuid),public.organization_program_assignments(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.save_organization_program(uuid,uuid,text,text,jsonb,integer),public.assign_organization_program(uuid,uuid,timestamptz,boolean,integer),public.organization_program_drafts(uuid),public.organization_program_versions(uuid),public.organization_program_assignments(uuid) TO authenticated;
COMMIT;
