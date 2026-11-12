BEGIN;
CREATE FUNCTION public.cohort_scope_access(_cohort uuid,_manage boolean)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
  SELECT auth.uid() IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.organization_cohorts oc WHERE oc.cohort_id=_cohort AND
    NOT CASE WHEN _manage THEN public.organization_manage(oc.organization_id) ELSE public.organization_access(oc.organization_id) AND
      (public.organization_manage(oc.organization_id) OR EXISTS(SELECT 1 FROM public.cohort_members WHERE cohort_id=_cohort AND user_id=auth.uid())
        OR EXISTS(SELECT 1 FROM public.cohort_report_managers WHERE cohort_id=_cohort AND user_id=auth.uid())) END)
$$;
REVOKE ALL ON FUNCTION public.cohort_scope_access(uuid,boolean) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.cohort_scope_access(uuid,boolean) TO authenticated;
CREATE POLICY organization_cohort_read_boundary ON public.cohorts AS RESTRICTIVE FOR SELECT TO authenticated USING(public.cohort_scope_access(id,false));
CREATE POLICY organization_cohort_update_boundary ON public.cohorts AS RESTRICTIVE FOR UPDATE TO authenticated USING(public.cohort_scope_access(id,true)) WITH CHECK(public.cohort_scope_access(id,true));
CREATE POLICY organization_cohort_delete_boundary ON public.cohorts AS RESTRICTIVE FOR DELETE TO authenticated USING(public.cohort_scope_access(id,true));
CREATE FUNCTION public.cohort_roster_scope(_cohort uuid,_user uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
  SELECT public.cohort_scope_access(_cohort,false) AND (_user=auth.uid() OR NOT EXISTS(SELECT 1 FROM public.organization_cohorts WHERE cohort_id=_cohort)
    OR EXISTS(SELECT 1 FROM public.organization_cohorts oc WHERE oc.cohort_id=_cohort AND public.organization_manage(oc.organization_id))
    OR EXISTS(SELECT 1 FROM public.cohort_report_managers WHERE cohort_id=_cohort AND user_id=auth.uid()))
$$;
REVOKE ALL ON FUNCTION public.cohort_roster_scope(uuid,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.cohort_roster_scope(uuid,uuid) TO authenticated;
CREATE POLICY organization_cohort_members_read ON public.cohort_members AS RESTRICTIVE FOR SELECT TO authenticated USING(public.cohort_roster_scope(cohort_id,user_id));
CREATE POLICY organization_cohort_members_insert ON public.cohort_members AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK(public.cohort_scope_access(cohort_id,true));
CREATE POLICY organization_cohort_members_update ON public.cohort_members AS RESTRICTIVE FOR UPDATE TO authenticated USING(public.cohort_scope_access(cohort_id,true)) WITH CHECK(public.cohort_scope_access(cohort_id,true));
CREATE POLICY organization_cohort_members_delete ON public.cohort_members AS RESTRICTIVE FOR DELETE TO authenticated USING(public.cohort_scope_access(cohort_id,true));
CREATE POLICY organization_cohort_courses_read ON public.cohort_course_assignments AS RESTRICTIVE FOR SELECT TO authenticated USING(public.cohort_scope_access(cohort_id,false));
CREATE POLICY organization_cohort_courses_insert ON public.cohort_course_assignments AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK(public.cohort_scope_access(cohort_id,true));
CREATE POLICY organization_cohort_courses_update ON public.cohort_course_assignments AS RESTRICTIVE FOR UPDATE TO authenticated USING(public.cohort_scope_access(cohort_id,true)) WITH CHECK(public.cohort_scope_access(cohort_id,true));
CREATE POLICY organization_cohort_courses_delete ON public.cohort_course_assignments AS RESTRICTIVE FOR DELETE TO authenticated USING(public.cohort_scope_access(cohort_id,true));

CREATE OR REPLACE FUNCTION public.cohort_report_access(_cohort uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
  SELECT auth.uid() IS NOT NULL AND (EXISTS(SELECT 1 FROM public.cohorts WHERE id=_cohort AND owner_id=auth.uid() AND public.has_role(auth.uid(),'admin'))
    OR EXISTS(SELECT 1 FROM public.cohort_report_managers WHERE cohort_id=_cohort AND user_id=auth.uid())
    OR EXISTS(SELECT 1 FROM public.organization_cohorts oc WHERE oc.cohort_id=_cohort AND public.organization_manage(oc.organization_id)))
    AND public.cohort_scope_access(_cohort,false)
$$;
CREATE FUNCTION public.organization_cohort_manage(_cohort uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE org_ref uuid;
BEGIN
  SELECT organization_id INTO org_ref FROM public.organization_cohorts WHERE cohort_id=_cohort;
  PERFORM 1 FROM public.organizations WHERE id=org_ref FOR UPDATE;
  IF NOT FOUND OR NOT public.organization_manage(org_ref) THEN RAISE EXCEPTION 'Organization cohort management access required'; END IF;
  RETURN org_ref;
END;
$$;
REVOKE ALL ON FUNCTION public.organization_cohort_manage(uuid) FROM PUBLIC,anon,authenticated;
CREATE FUNCTION public.create_organization_cohort(_organization uuid,_cohort uuid,_name text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
  PERFORM 1 FROM public.organizations WHERE id=_organization FOR UPDATE;
  IF NOT FOUND OR NOT public.organization_manage(_organization) THEN RAISE EXCEPTION 'Organization management access required'; END IF;
  IF _cohort IS NULL OR _name IS NULL OR char_length(btrim(_name)) NOT BETWEEN 2 AND 200 THEN RAISE EXCEPTION 'Give the cohort a name'; END IF;
  IF EXISTS(SELECT 1 FROM public.cohorts WHERE id=_cohort) THEN
    IF NOT EXISTS(SELECT 1 FROM public.cohorts c JOIN public.organization_cohorts oc ON oc.cohort_id=c.id WHERE c.id=_cohort AND c.owner_id=auth.uid() AND oc.organization_id=_organization AND c.name=btrim(_name)) THEN RAISE EXCEPTION 'Cohort creation request changed'; END IF;
    RETURN _cohort;
  END IF;
  INSERT INTO public.cohorts(id,name,owner_id) VALUES(_cohort,btrim(_name),auth.uid());
  INSERT INTO public.organization_cohorts(cohort_id,organization_id) VALUES(_cohort,_organization);
  INSERT INTO public.audit_events(actor_id,action,entity_type,entity_id,metadata) VALUES(auth.uid(),'organization.cohort_created','cohort',_cohort::text,jsonb_build_object('organization_id',_organization));
  RETURN _cohort;
END;
$$;
CREATE FUNCTION public.save_organization_cohort(_cohort uuid,_name text,_seats integer,_auto_free boolean,_expected integer)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE org_ref uuid; result integer;
BEGIN
  org_ref:=public.organization_cohort_manage(_cohort);
  IF _name IS NULL OR char_length(btrim(_name)) NOT BETWEEN 2 AND 200 OR _auto_free IS NULL OR (_seats IS NOT NULL AND _seats NOT BETWEEN 1 AND 100000) THEN RAISE EXCEPTION 'Give valid cohort settings'; END IF;
  UPDATE public.cohorts SET name=btrim(_name),seat_limit=_seats,auto_enrol_free=_auto_free,policy_version=policy_version+1 WHERE id=_cohort AND policy_version=_expected RETURNING policy_version INTO result;
  IF result IS NULL THEN RAISE EXCEPTION 'Cohort changed. Refresh before saving'; END IF;
  INSERT INTO public.audit_events(actor_id,action,entity_type,entity_id,metadata) VALUES(auth.uid(),'organization.cohort_settings','cohort',_cohort::text,jsonb_build_object('organization_id',org_ref,'version',result));
  RETURN result;
END;
$$;
CREATE FUNCTION public.set_organization_cohort_member(_cohort uuid,_user uuid,_include boolean)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE org_ref uuid;
BEGIN
  org_ref:=public.organization_cohort_manage(_cohort);
  PERFORM 1 FROM public.cohorts WHERE id=_cohort FOR UPDATE;
  IF _include IS NULL OR _user IS NULL THEN RAISE EXCEPTION 'Choose a workspace member'; END IF;
  IF _include THEN
    IF NOT public.organization_user_access(org_ref,_user) THEN RAISE EXCEPTION 'Choose a current organization member'; END IF;
    INSERT INTO public.cohort_members(cohort_id,user_id) VALUES(_cohort,_user) ON CONFLICT DO NOTHING;
  ELSE DELETE FROM public.cohort_members WHERE cohort_id=_cohort AND user_id=_user; END IF;
  INSERT INTO public.audit_events(actor_id,action,entity_type,entity_id,metadata) VALUES(auth.uid(),'organization.cohort_membership','cohort',_cohort::text,jsonb_build_object('user_id',_user,'included',_include));
END;
$$;
CREATE FUNCTION public.set_organization_cohort_course(_cohort uuid,_course uuid,_include boolean,_due timestamptz)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE org_ref uuid;
BEGIN
  org_ref:=public.organization_cohort_manage(_cohort);
  PERFORM 1 FROM public.studio_courses WHERE id=_course FOR SHARE;
  PERFORM 1 FROM public.cohorts WHERE id=_cohort FOR UPDATE;
  IF _include IS NULL THEN RAISE EXCEPTION 'Choose a course assignment action'; END IF;
  IF _include THEN
    IF NOT EXISTS(SELECT 1 FROM public.studio_courses c LEFT JOIN public.organization_courses oc ON oc.course_id=c.id WHERE c.id=_course AND c.published AND c.revision_of IS NULL AND (oc.organization_id IS NULL OR oc.organization_id=org_ref)) THEN RAISE EXCEPTION 'Choose a published public course or a course in this organization'; END IF;
    INSERT INTO public.cohort_course_assignments(cohort_id,course_id,due_at) VALUES(_cohort,_course,_due) ON CONFLICT(cohort_id,course_id) DO UPDATE SET due_at=excluded.due_at;
  ELSE DELETE FROM public.cohort_course_assignments WHERE cohort_id=_cohort AND course_id=_course; END IF;
  INSERT INTO public.audit_events(actor_id,action,entity_type,entity_id,metadata) VALUES(auth.uid(),'organization.cohort_course','cohort',_cohort::text,jsonb_build_object('course_id',_course,'included',_include,'due_at',_due));
END;
$$;

CREATE FUNCTION public.organization_training_cohorts(_organization uuid)
RETURNS TABLE(id uuid,name text,seat_limit integer,auto_enrol_free boolean,policy_version integer,member_count bigint,can_bill boolean)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
  SELECT c.id,c.name,c.seat_limit,c.auto_enrol_free,c.policy_version,(SELECT count(*) FROM public.cohort_members m WHERE m.cohort_id=c.id),c.owner_id=auth.uid()
  FROM public.cohorts c JOIN public.organization_cohorts oc ON oc.cohort_id=c.id WHERE oc.organization_id=_organization AND public.organization_manage(_organization)
$$;
CREATE FUNCTION public.organization_cohort_people(_cohort uuid)
RETURNS TABLE(user_id uuid,full_name text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
  SELECT m.user_id,coalesce(nullif(p.full_name,''),'Learner') FROM public.cohort_members m LEFT JOIN public.profiles p ON p.user_id=m.user_id
  JOIN public.organization_cohorts oc ON oc.cohort_id=m.cohort_id WHERE m.cohort_id=_cohort AND public.organization_manage(oc.organization_id)
$$;
CREATE FUNCTION public.organization_cohort_courses(_cohort uuid)
RETURNS TABLE(course_id uuid,title text,published boolean,price_cents integer,currency text,due_at timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
  SELECT c.id,c.title,c.published,c.price_cents,c.currency,a.due_at FROM public.cohort_course_assignments a JOIN public.studio_courses c ON c.id=a.course_id
  JOIN public.organization_cohorts oc ON oc.cohort_id=a.cohort_id WHERE a.cohort_id=_cohort AND public.organization_manage(oc.organization_id)
$$;
CREATE FUNCTION public.organization_learning_summary(_organization uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
  WITH assignments AS (SELECT DISTINCT m.user_id,a.course_id FROM public.organization_cohorts oc JOIN public.cohort_members m ON m.cohort_id=oc.cohort_id JOIN public.cohort_course_assignments a ON a.cohort_id=oc.cohort_id WHERE oc.organization_id=_organization)
  SELECT jsonb_build_object('members',(SELECT count(*) FROM public.organization_members WHERE organization_id=_organization),
    'private_courses',(SELECT count(*) FROM public.organization_courses WHERE organization_id=_organization),
    'cohorts',(SELECT count(*) FROM public.organization_cohorts WHERE organization_id=_organization),
    'assigned_learner_courses',(SELECT count(*) FROM assignments),
    'verified_current',(SELECT count(*) FROM assignments a WHERE EXISTS(SELECT 1 FROM public.certificates c WHERE c.user_id=a.user_id AND c.source='studio' AND c.course_ref=a.course_id::text AND c.validated_at IS NOT NULL AND public.certificate_is_current(c.id))))
  WHERE public.organization_manage(_organization)
$$;
CREATE FUNCTION public.organization_assignable_courses(_organization uuid)
RETURNS TABLE(id uuid,title text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
  SELECT c.id,c.title FROM public.studio_courses c LEFT JOIN public.organization_courses oc ON oc.course_id=c.id
  WHERE c.published AND c.revision_of IS NULL AND (oc.organization_id IS NULL OR oc.organization_id=_organization) AND public.organization_manage(_organization)
$$;
REVOKE ALL ON FUNCTION public.organization_assignable_courses(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.organization_assignable_courses(uuid) TO authenticated;

CREATE FUNCTION public.cohort_billing_authorized(_cohort uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
  SELECT EXISTS(SELECT 1 FROM public.cohorts c LEFT JOIN public.organization_cohorts oc ON oc.cohort_id=c.id WHERE c.id=_cohort AND c.owner_id=auth.uid()
    AND ((oc.organization_id IS NULL AND public.has_role(auth.uid(),'admin')) OR (oc.organization_id IS NOT NULL AND public.organization_manage(oc.organization_id))))
$$;
REVOKE ALL ON FUNCTION public.cohort_billing_authorized(uuid) FROM PUBLIC,anon,authenticated;
DO $billing$
DECLARE definition text; signature text; expression text;
BEGIN
  FOR signature,expression IN SELECT * FROM (VALUES
    ('public.create_course_license_order(uuid,uuid,integer,uuid)','_cohort'),
    ('public.allocate_course_licenses(uuid,uuid[])','(SELECT cohort_id FROM public.course_license_orders WHERE id=_order)'),
    ('public.set_course_license_enabled(uuid,boolean,text,integer)','(SELECT o.cohort_id FROM public.course_license_orders o JOIN public.course_license_seats s ON s.order_id=o.id WHERE s.id=_seat)'),
    ('public.course_license_candidates(uuid,uuid)','_cohort'),
    ('public.course_license_allocations(uuid)','cohort_ref'),
    ('public.course_license_order_report(uuid)','order_row.cohort_id')) values_for_patch LOOP
    SELECT pg_get_functiondef(signature::regprocedure) INTO definition;
    IF strpos(definition,'NOT public.has_role(auth.uid(),''admin'')')=0 THEN RAISE EXCEPTION 'Unexpected licence management guard in %',signature; END IF;
    EXECUTE replace(definition,'NOT public.has_role(auth.uid(),''admin'')','NOT public.cohort_billing_authorized('||expression||')');
  END LOOP;
END;
$billing$;
DO $legacy_controls$
DECLARE definition text; signature text;
BEGIN
  FOREACH signature IN ARRAY ARRAY['public.save_cohort_policy(uuid,integer,boolean,boolean,integer)','public.set_cohort_report_manager(uuid,uuid,boolean)','public.assign_cohort_program(uuid,uuid,timestamptz,boolean,integer)'] LOOP
    SELECT pg_get_functiondef(signature::regprocedure) INTO definition;
    IF strpos(definition,E'BEGIN\n')=0 THEN RAISE EXCEPTION 'Unexpected cohort management definition'; END IF;
    EXECUTE replace(definition,E'BEGIN\n',E'BEGIN\n  IF NOT public.cohort_scope_access(_cohort,true) THEN RAISE EXCEPTION ''Organization management access required''; END IF;\n');
  END LOOP;
END;
$legacy_controls$;
CREATE FUNCTION public.cohort_billing_destination(_cohort uuid)
RETURNS uuid LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE result uuid;
BEGIN
  IF NOT public.cohort_billing_authorized(_cohort) THEN RAISE EXCEPTION 'Cohort purchase access required'; END IF;
  SELECT organization_id INTO result FROM public.organization_cohorts WHERE cohort_id=_cohort; RETURN result;
END;
$$;
REVOKE ALL ON FUNCTION public.cohort_billing_destination(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.cohort_billing_destination(uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.create_organization_cohort(uuid,uuid,text),public.save_organization_cohort(uuid,text,integer,boolean,integer),public.set_organization_cohort_member(uuid,uuid,boolean),public.set_organization_cohort_course(uuid,uuid,boolean,timestamptz),public.organization_training_cohorts(uuid),public.organization_cohort_people(uuid),public.organization_cohort_courses(uuid),public.organization_learning_summary(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.create_organization_cohort(uuid,uuid,text),public.save_organization_cohort(uuid,text,integer,boolean,integer),public.set_organization_cohort_member(uuid,uuid,boolean),public.set_organization_cohort_course(uuid,uuid,boolean,timestamptz),public.organization_training_cohorts(uuid),public.organization_cohort_people(uuid),public.organization_cohort_courses(uuid),public.organization_learning_summary(uuid) TO authenticated;
COMMIT;
