BEGIN;
CREATE TABLE public.organization_courses (
  course_id uuid PRIMARY KEY REFERENCES public.studio_courses(id) ON DELETE CASCADE,
  organization_id uuid NOT NULL REFERENCES public.organizations(id)
);
CREATE TABLE public.organization_cohorts (
  cohort_id uuid PRIMARY KEY REFERENCES public.cohorts(id) ON DELETE CASCADE,
  organization_id uuid NOT NULL REFERENCES public.organizations(id)
);
CREATE INDEX organization_courses_scope ON public.organization_courses(organization_id,course_id);
CREATE INDEX organization_cohorts_scope ON public.organization_cohorts(organization_id,cohort_id);
ALTER TABLE public.organization_courses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.organization_cohorts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.organization_courses,public.organization_cohorts FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.organization_courses,public.organization_cohorts TO authenticated;
GRANT ALL ON public.organization_courses,public.organization_cohorts TO service_role;
CREATE FUNCTION public.organization_user_access(_organization uuid,_user uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
  SELECT _user IS NOT NULL AND (EXISTS(SELECT 1 FROM public.organizations WHERE id=_organization AND owner_id=_user)
    OR EXISTS(SELECT 1 FROM public.organization_members WHERE organization_id=_organization AND user_id=_user))
$$;
CREATE FUNCTION public.course_organization_access(_course uuid,_user uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
  SELECT NOT EXISTS(SELECT 1 FROM public.organization_courses WHERE course_id=_course)
    OR EXISTS(SELECT 1 FROM public.studio_courses WHERE id=_course AND author_id=_user)
    OR EXISTS(SELECT 1 FROM public.organization_courses WHERE course_id=_course AND public.organization_user_access(organization_id,_user))
$$;
REVOKE ALL ON FUNCTION public.organization_user_access(uuid,uuid),public.course_organization_access(uuid,uuid) FROM PUBLIC,anon,authenticated;
CREATE FUNCTION public.course_catalog_visible(_course uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
  SELECT EXISTS(SELECT 1 FROM public.studio_courses c WHERE c.id=_course AND (c.author_id=auth.uid() OR (c.published AND public.course_organization_access(c.id,auth.uid()))))
$$;
REVOKE ALL ON FUNCTION public.course_catalog_visible(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.course_catalog_visible(uuid) TO anon,authenticated;
CREATE POLICY course_organization_boundary ON public.studio_courses AS RESTRICTIVE FOR SELECT TO anon,authenticated USING(public.course_catalog_visible(id));
CREATE POLICY organization_courses_read ON public.organization_courses FOR SELECT TO authenticated USING(public.organization_access(organization_id) OR EXISTS(SELECT 1 FROM public.studio_courses WHERE id=course_id AND author_id=auth.uid()));
CREATE POLICY organization_cohorts_read ON public.organization_cohorts FOR SELECT TO authenticated USING(public.organization_access(organization_id));
CREATE OR REPLACE FUNCTION public.studio_course_visible(_course uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
  SELECT EXISTS(SELECT 1 FROM public.studio_courses c WHERE c.id=_course AND (c.author_id=auth.uid() OR
    (c.published AND public.course_organization_access(c.id,auth.uid()) AND public.studio_prerequisite_satisfied(c.id) AND (c.price_cents=0 OR public.course_paid_entitled(c.id,auth.uid())))))
$$;

CREATE FUNCTION public.set_course_organization(_course uuid,_organization uuid,_expected uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE current_org uuid;
BEGIN
  PERFORM 1 FROM public.studio_courses WHERE id=_course AND author_id=auth.uid() AND NOT published AND revision_of IS NULL FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Only the owner of an unpublished canonical course can change its organization'; END IF;
  IF _organization IS NOT NULL AND NOT public.organization_access(_organization) THEN RAISE EXCEPTION 'Choose an organization you belong to'; END IF;
  SELECT organization_id INTO current_org FROM public.organization_courses WHERE course_id=_course;
  IF current_org IS DISTINCT FROM _expected THEN RAISE EXCEPTION 'Course organization changed. Refresh before saving'; END IF;
  IF _organization IS NOT NULL AND (EXISTS(SELECT 1 FROM public.cohort_course_assignments a LEFT JOIN public.organization_cohorts oc ON oc.cohort_id=a.cohort_id WHERE a.course_id=_course AND oc.organization_id IS DISTINCT FROM _organization)
    OR EXISTS(SELECT 1 FROM public.learning_program_versions v JOIN public.cohort_program_assignments a ON a.version_id=v.id AND a.active LEFT JOIN public.organization_cohorts oc ON oc.cohort_id=a.cohort_id
      WHERE EXISTS(SELECT 1 FROM jsonb_array_elements(v.stages) stage CROSS JOIN LATERAL jsonb_array_elements_text(stage->'course_ids') item WHERE item.value=_course::text) AND oc.organization_id IS DISTINCT FROM _organization))
    THEN RAISE EXCEPTION 'End incompatible course or program cohort assignments before restricting this course'; END IF;
  IF _organization IS NULL THEN DELETE FROM public.organization_courses WHERE course_id=_course;
  ELSE INSERT INTO public.organization_courses(course_id,organization_id) VALUES(_course,_organization) ON CONFLICT(course_id) DO UPDATE SET organization_id=excluded.organization_id; END IF;
  INSERT INTO public.audit_events(actor_id,action,entity_type,entity_id,metadata) VALUES(auth.uid(),'course.organization_changed','course',_course::text,jsonb_build_object('organization_id',_organization,'previous_organization_id',current_org));
END;
$$;
REVOKE ALL ON FUNCTION public.set_course_organization(uuid,uuid,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.set_course_organization(uuid,uuid,uuid) TO authenticated;

CREATE FUNCTION public.bind_organization_cohort(_cohort uuid,_organization uuid,_expected uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE current_org uuid;
BEGIN
  IF _organization IS NULL OR NOT public.organization_manage(_organization) THEN RAISE EXCEPTION 'Organization management access required'; END IF;
  PERFORM 1 FROM public.organizations WHERE id=_organization FOR UPDATE;
  PERFORM 1 FROM public.studio_courses c WHERE c.id IN(SELECT course_id FROM public.cohort_course_assignments WHERE cohort_id=_cohort) ORDER BY c.id FOR SHARE;
  PERFORM 1 FROM public.cohorts WHERE id=_cohort AND owner_id=auth.uid() FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Only the cohort owner can bind their cohort to an organization'; END IF;
  SELECT organization_id INTO current_org FROM public.organization_cohorts WHERE cohort_id=_cohort;
  IF current_org IS DISTINCT FROM _expected THEN RAISE EXCEPTION 'Cohort organization changed. Refresh before saving'; END IF;
  IF current_org IS NOT NULL AND current_org<>_organization THEN RAISE EXCEPTION 'Create a new cohort instead of transferring an organization cohort'; END IF;
  IF EXISTS(SELECT 1 FROM public.cohort_members m WHERE m.cohort_id=_cohort AND NOT public.organization_user_access(_organization,m.user_id))
    OR EXISTS(SELECT 1 FROM public.cohort_course_assignments a JOIN public.organization_courses oc ON oc.course_id=a.course_id WHERE a.cohort_id=_cohort AND oc.organization_id<>_organization)
    OR EXISTS(SELECT 1 FROM public.cohort_program_assignments a JOIN public.learning_program_versions v ON v.id=a.version_id
      CROSS JOIN LATERAL jsonb_array_elements(v.stages) stage CROSS JOIN LATERAL jsonb_array_elements_text(stage->'course_ids') item
      JOIN public.organization_courses oc ON oc.course_id=item.value::uuid WHERE a.cohort_id=_cohort AND oc.organization_id<>_organization)
    THEN RAISE EXCEPTION 'All members and private courses must belong to this organization'; END IF;
  INSERT INTO public.organization_cohorts(cohort_id,organization_id) VALUES(_cohort,_organization) ON CONFLICT(cohort_id) DO NOTHING;
  INSERT INTO public.audit_events(actor_id,action,entity_type,entity_id,metadata) VALUES(auth.uid(),'cohort.organization_bound','cohort',_cohort::text,jsonb_build_object('organization_id',_organization));
END;
$$;
REVOKE ALL ON FUNCTION public.bind_organization_cohort(uuid,uuid,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.bind_organization_cohort(uuid,uuid,uuid) TO authenticated;

CREATE FUNCTION public.cohort_organization_guard()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE cohort_org uuid; course_org uuid; version_stages jsonb;
BEGIN
  IF TG_TABLE_NAME='cohort_course_assignments' THEN
    PERFORM 1 FROM public.studio_courses WHERE id=NEW.course_id FOR SHARE;
    SELECT organization_id INTO cohort_org FROM public.organization_cohorts WHERE cohort_id=NEW.cohort_id;
    SELECT organization_id INTO course_org FROM public.organization_courses WHERE course_id=NEW.course_id;
    IF course_org IS NOT NULL AND course_org IS DISTINCT FROM cohort_org THEN RAISE EXCEPTION 'Private courses require a cohort in the same organization'; END IF;
  ELSIF TG_TABLE_NAME='cohort_members' THEN
    SELECT organization_id INTO cohort_org FROM public.organization_cohorts WHERE cohort_id=NEW.cohort_id;
    PERFORM 1 FROM public.organization_members WHERE organization_id=cohort_org AND user_id=NEW.user_id FOR SHARE;
    IF cohort_org IS NOT NULL AND NOT public.organization_user_access(cohort_org,NEW.user_id) THEN RAISE EXCEPTION 'Add this learner to the organization before adding them to its cohort'; END IF;
  ELSE
    SELECT stages INTO version_stages FROM public.learning_program_versions WHERE id=NEW.version_id;
    PERFORM 1 FROM public.studio_courses WHERE id IN(SELECT item.value::uuid FROM jsonb_array_elements(version_stages) stage CROSS JOIN LATERAL jsonb_array_elements_text(stage->'course_ids') item) ORDER BY id FOR SHARE;
    SELECT organization_id INTO cohort_org FROM public.organization_cohorts WHERE cohort_id=NEW.cohort_id;
    IF EXISTS(SELECT 1 FROM jsonb_array_elements(version_stages) stage CROSS JOIN LATERAL jsonb_array_elements_text(stage->'course_ids') item JOIN public.organization_courses oc ON oc.course_id=item.value::uuid WHERE oc.organization_id IS DISTINCT FROM cohort_org)
      THEN RAISE EXCEPTION 'Private program courses require a cohort in the same organization'; END IF;
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.cohort_organization_guard() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER cohort_organization_course BEFORE INSERT OR UPDATE ON public.cohort_course_assignments FOR EACH ROW EXECUTE FUNCTION public.cohort_organization_guard();
CREATE TRIGGER cohort_organization_member BEFORE INSERT OR UPDATE ON public.cohort_members FOR EACH ROW EXECUTE FUNCTION public.cohort_organization_guard();
CREATE TRIGGER cohort_organization_program BEFORE INSERT OR UPDATE ON public.cohort_program_assignments FOR EACH ROW EXECUTE FUNCTION public.cohort_organization_guard();

DO $scope$
DECLARE definition text; original text;
BEGIN
  SELECT pg_get_functiondef('public.lock_course_license_access(uuid,uuid)'::regprocedure) INTO definition;
  original:='  PERFORM 1 FROM public.studio_courses WHERE id=_course FOR SHARE;';
  IF strpos(definition,original)=0 THEN RAISE EXCEPTION 'Unexpected course access lock definition'; END IF;
  EXECUTE replace(definition,original,original||E'\n'||'  PERFORM 1 FROM public.organization_members m JOIN public.organization_courses oc ON oc.organization_id=m.organization_id WHERE oc.course_id=_course AND m.user_id=_user FOR SHARE OF m;');
  SELECT pg_get_functiondef('public.validate_program_stages(jsonb)'::regprocedure) INTO definition;
  original:='WHERE id=course_ref AND published AND revision_of IS NULL;';
  IF strpos(definition,original)=0 THEN RAISE EXCEPTION 'Unexpected program course validation'; END IF;
  EXECUTE replace(definition,original,'WHERE id=course_ref AND published AND revision_of IS NULL AND public.course_organization_access(id,auth.uid());');
  SELECT pg_get_functiondef('public.studio_copy_draft(uuid,boolean)'::regprocedure) INTO definition;
  original:=' FOR m IN SELECT * FROM public.studio_modules';
  IF strpos(definition,original)=0 THEN RAISE EXCEPTION 'Unexpected course copy definition'; END IF;
  EXECUTE replace(definition,original,' INSERT INTO public.organization_courses(course_id,organization_id) SELECT new_id,organization_id FROM public.organization_courses WHERE course_id=c.id;'||E'\n'||original);
  SELECT pg_get_functiondef('public.export_course_archive(uuid)'::regprocedure) INTO definition;
  original:='snapshot:=public.studio_snapshot(_course);';
  IF strpos(definition,original)=0 THEN RAISE EXCEPTION 'Unexpected content archive definition'; END IF;
  EXECUTE replace(definition,original,'snapshot:=public.studio_snapshot(_course)||jsonb_build_object(''organization_id'',(SELECT organization_id FROM public.organization_courses WHERE course_id=_course));');
  SELECT pg_get_functiondef('public.restore_course_archive(uuid,jsonb)'::regprocedure) INTO definition;
  original:='  INSERT INTO public.course_archive_restores(request_id,user_id,course_id,archive_digest)';
  IF strpos(definition,original)=0 THEN RAISE EXCEPTION 'Unexpected archive restore definition'; END IF;
  EXECUTE replace(definition,original,$restore$
  IF nullif(snapshot->>'organization_id','') IS NOT NULL THEN
    IF NOT public.organization_access((snapshot->>'organization_id')::uuid) THEN RAISE EXCEPTION 'Organization membership is required to restore this private archive'; END IF;
    INSERT INTO public.organization_courses(course_id,organization_id) VALUES(target,(snapshot->>'organization_id')::uuid);
  END IF;
  INSERT INTO public.course_archive_restores(request_id,user_id,course_id,archive_digest)
$restore$);
  SELECT pg_get_functiondef('public.remove_organization_member(uuid,uuid,integer)'::regprocedure) INTO definition;
  original:='  DELETE FROM public.organization_members WHERE organization_id=_organization AND user_id=_user;';
  IF strpos(definition,original)=0 THEN RAISE EXCEPTION 'Unexpected organization removal definition'; END IF;
  EXECUTE replace(definition,original,'  DELETE FROM public.cohort_report_managers r USING public.organization_cohorts oc WHERE r.cohort_id=oc.cohort_id AND oc.organization_id=_organization AND r.user_id=_user;'||E'\n'||
    '  DELETE FROM public.cohort_members m USING public.organization_cohorts oc WHERE m.cohort_id=oc.cohort_id AND oc.organization_id=_organization AND m.user_id=_user;'||E'\n'||original);
END;
$scope$;

CREATE OR REPLACE FUNCTION public.cohort_report_access(_cohort uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
  SELECT auth.uid() IS NOT NULL AND (EXISTS(SELECT 1 FROM public.cohorts WHERE id=_cohort AND owner_id=auth.uid() AND public.has_role(auth.uid(),'admin'))
    OR EXISTS(SELECT 1 FROM public.cohort_report_managers WHERE cohort_id=_cohort AND user_id=auth.uid()))
    AND NOT EXISTS(SELECT 1 FROM public.organization_cohorts oc WHERE oc.cohort_id=_cohort AND NOT public.organization_access(oc.organization_id))
$$;
CREATE FUNCTION public.community_member_authorized(_course uuid,_user uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
  SELECT _user IS NOT NULL AND public.course_organization_access(_course,_user)
    AND EXISTS(SELECT 1 FROM public.community_members WHERE course_id=_course AND user_id=_user)
    AND EXISTS(SELECT 1 FROM public.certificates WHERE user_id=_user AND source='studio' AND course_ref=_course::text AND revoked_at IS NULL)
$$;
REVOKE ALL ON FUNCTION public.community_member_authorized(uuid,uuid) FROM PUBLIC,anon,authenticated;
CREATE FUNCTION public.my_community_access(_course uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
  SELECT public.community_member_authorized(_course,auth.uid())
$$;
REVOKE ALL ON FUNCTION public.my_community_access(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.my_community_access(uuid) TO authenticated;
CREATE FUNCTION public.community_member_visible(_course uuid,_user uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
  SELECT public.my_community_access(_course) AND public.community_member_authorized(_course,_user)
$$;
REVOKE ALL ON FUNCTION public.community_member_visible(uuid,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.community_member_visible(uuid,uuid) TO authenticated;
ALTER POLICY "Members of a community can see its roster" ON public.community_members USING(public.community_member_visible(course_id,user_id));
ALTER POLICY "Members read their community's messages" ON public.community_messages USING(public.my_community_access(course_id));
ALTER POLICY "Members post to their community" ON public.community_messages WITH CHECK(user_id=auth.uid() AND public.my_community_access(course_id));
CREATE OR REPLACE FUNCTION public.community_join(_course_id uuid)
RETURNS public.community_members LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE result public.community_members;
BEGIN
  IF auth.uid() IS NULL OR NOT public.course_organization_access(_course_id,auth.uid()) OR NOT EXISTS(SELECT 1 FROM public.certificates
    WHERE user_id=auth.uid() AND source='studio' AND course_ref=_course_id::text AND revoked_at IS NULL) THEN RAISE EXCEPTION 'A valid course completion and organization access are required to join this community'; END IF;
  INSERT INTO public.community_members(course_id,user_id) VALUES(_course_id,auth.uid()) ON CONFLICT(course_id,user_id) DO NOTHING;
  SELECT * INTO result FROM public.community_members WHERE course_id=_course_id AND user_id=auth.uid(); RETURN result;
END;
$$;
CREATE OR REPLACE FUNCTION public.community_roster(_course_id uuid)
RETURNS TABLE(user_id uuid,full_name text,joined_at timestamptz) LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
  SELECT m.user_id,p.full_name,m.joined_at FROM public.community_members m LEFT JOIN public.profiles p ON p.user_id=m.user_id
  WHERE m.course_id=_course_id AND public.my_community_access(_course_id) AND public.community_member_authorized(_course_id,m.user_id) ORDER BY m.joined_at,m.user_id
$$;
CREATE OR REPLACE FUNCTION public.shares_community(_a uuid,_b uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
  SELECT auth.uid() IS NOT NULL AND auth.uid() IN(_a,_b) AND EXISTS(SELECT 1 FROM public.community_members ma JOIN public.community_members mb ON mb.course_id=ma.course_id
    WHERE ma.user_id=_a AND mb.user_id=_b AND public.community_member_authorized(ma.course_id,_a) AND public.community_member_authorized(ma.course_id,_b))
$$;
COMMIT;
