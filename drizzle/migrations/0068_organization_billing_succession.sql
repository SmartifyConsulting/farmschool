BEGIN;
CREATE TABLE public.cohort_billing_managers (
  cohort_id uuid NOT NULL REFERENCES public.cohorts(id) ON DELETE CASCADE, user_id uuid NOT NULL, version integer NOT NULL DEFAULT 1,
  granted_by uuid NOT NULL, reason text NOT NULL CHECK(char_length(btrim(reason)) BETWEEN 20 AND 2000), changed_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY(cohort_id,user_id)
);
ALTER TABLE public.cohort_billing_managers ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.cohort_billing_managers FROM PUBLIC,anon,authenticated;
GRANT ALL ON public.cohort_billing_managers TO service_role;
CREATE OR REPLACE FUNCTION public.cohort_billing_authorized(_cohort uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
  SELECT EXISTS(SELECT 1 FROM public.cohorts c LEFT JOIN public.organization_cohorts oc ON oc.cohort_id=c.id LEFT JOIN public.organizations o ON o.id=oc.organization_id WHERE c.id=_cohort AND
    CASE WHEN oc.organization_id IS NULL THEN c.owner_id=auth.uid() AND public.has_role(auth.uid(),'admin')
    ELSE public.organization_manage(oc.organization_id) AND (c.owner_id=auth.uid() OR o.owner_id=auth.uid() OR EXISTS(SELECT 1 FROM public.cohort_billing_managers b WHERE b.cohort_id=c.id AND b.user_id=auth.uid())) END)
$$;
CREATE FUNCTION public.my_cohort_billing_access(_cohort uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
  SELECT public.cohort_billing_authorized(_cohort)
$$;
REVOKE ALL ON FUNCTION public.my_cohort_billing_access(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.my_cohort_billing_access(uuid) TO authenticated;
ALTER POLICY license_orders_owner_read ON public.course_license_orders USING(public.my_cohort_billing_access(cohort_id));
ALTER POLICY license_seats_read ON public.course_license_seats USING(user_id=auth.uid() OR EXISTS(SELECT 1 FROM public.course_license_orders o WHERE o.id=order_id AND public.my_cohort_billing_access(o.cohort_id)));
DO $delegation$
DECLARE definition text; signature text; old text;
BEGIN
  SELECT pg_get_functiondef('public.create_course_license_order(uuid,uuid,integer,uuid)'::regprocedure) INTO definition;
  old:='WHERE id=_cohort AND owner_id=auth.uid() FOR UPDATE;';
  IF strpos(definition,old)=0 THEN RAISE EXCEPTION 'Unexpected cohort purchase ownership check'; END IF;
  EXECUTE replace(definition,old,'WHERE id=_cohort AND public.cohort_billing_authorized(id) FOR UPDATE;');
  SELECT pg_get_functiondef('public.course_license_candidates(uuid,uuid)'::regprocedure) INTO definition;
  old:='WHERE id=_cohort AND owner_id=auth.uid()';
  IF strpos(definition,old)=0 THEN RAISE EXCEPTION 'Unexpected licence candidate ownership check'; END IF;
  EXECUTE replace(definition,old,'WHERE id=_cohort AND public.cohort_billing_authorized(id)');
  FOREACH signature IN ARRAY ARRAY['public.allocate_course_licenses(uuid,uuid[])','public.set_course_license_enabled(uuid,boolean,text,integer)','public.course_license_allocations(uuid)','public.course_license_order_report(uuid)'] LOOP
    SELECT pg_get_functiondef(signature::regprocedure) INTO definition;
    IF strpos(definition,'c.owner_id=auth.uid()')=0 THEN RAISE EXCEPTION 'Unexpected licence ownership check in %',signature; END IF;
    EXECUTE replace(definition,'c.owner_id=auth.uid()','public.cohort_billing_authorized(c.id)');
  END LOOP;
  SELECT pg_get_functiondef('public.organization_training_cohorts(uuid)'::regprocedure) INTO definition;
  IF strpos(definition,'c.owner_id=auth.uid()')=0 THEN RAISE EXCEPTION 'Unexpected organization billing capability check'; END IF;
  EXECUTE replace(definition,'c.owner_id=auth.uid()','public.cohort_billing_authorized(c.id)');
  SELECT pg_get_functiondef('public.remove_organization_member(uuid,uuid,integer)'::regprocedure) INTO definition;
  old:='  DELETE FROM public.organization_members WHERE organization_id=_organization AND user_id=_user;';
  IF strpos(definition,old)=0 THEN RAISE EXCEPTION 'Unexpected organization member removal'; END IF;
  EXECUTE replace(definition,old,'  DELETE FROM public.cohort_billing_managers b USING public.organization_cohorts oc WHERE b.cohort_id=oc.cohort_id AND oc.organization_id=_organization AND b.user_id=_user;'||E'\n'||old);
  SELECT pg_get_functiondef('public.set_organization_member(uuid,text,text,uuid,uuid,text,integer)'::regprocedure) INTO definition;
  old:='  INSERT INTO public.audit_events(actor_id,action,entity_type,entity_id,metadata)';
  IF strpos(definition,old)=0 THEN RAISE EXCEPTION 'Unexpected organization role update'; END IF;
  EXECUTE replace(definition,old,'  IF _role<>''manager'' THEN DELETE FROM public.cohort_billing_managers b USING public.organization_cohorts oc WHERE b.cohort_id=oc.cohort_id AND oc.organization_id=_organization AND b.user_id=person; END IF;'||E'\n'||old);
END;
$delegation$;
CREATE FUNCTION public.set_cohort_billing_manager(_cohort uuid,_user uuid,_allow boolean,_expected integer,_reason text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE org_ref uuid; creator uuid; current_version integer;
BEGIN
  SELECT oc.organization_id,c.owner_id INTO org_ref,creator FROM public.organization_cohorts oc JOIN public.cohorts c ON c.id=oc.cohort_id WHERE oc.cohort_id=_cohort;
  PERFORM 1 FROM public.organizations WHERE id=org_ref AND owner_id=auth.uid() FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Only the organization owner can appoint cohort billing managers'; END IF;
  IF _user IS NULL OR _allow IS NULL OR _reason IS NULL OR char_length(btrim(_reason)) NOT BETWEEN 20 AND 2000 THEN RAISE EXCEPTION 'Choose a manager and give a reason of 20 to 2000 characters'; END IF;
  IF _user=creator OR _user=auth.uid() THEN RAISE EXCEPTION 'The cohort creator and organization owner have implicit billing access. Delegate access to another manager'; END IF;
  IF _allow AND (NOT public.organization_user_access(org_ref,_user) OR NOT EXISTS(SELECT 1 FROM public.organization_members WHERE organization_id=org_ref AND user_id=_user AND role='manager')) THEN RAISE EXCEPTION 'Choose another current workspace manager without implicit billing access'; END IF;
  SELECT version INTO current_version FROM public.cohort_billing_managers WHERE cohort_id=_cohort AND user_id=_user FOR UPDATE;
  IF coalesce(current_version,0) IS DISTINCT FROM _expected THEN RAISE EXCEPTION 'Billing authority changed. Refresh before saving'; END IF;
  IF _allow THEN
    INSERT INTO public.cohort_billing_managers(cohort_id,user_id,granted_by,reason) VALUES(_cohort,_user,auth.uid(),btrim(_reason))
      ON CONFLICT(cohort_id,user_id) DO UPDATE SET granted_by=excluded.granted_by,reason=excluded.reason,version=cohort_billing_managers.version+1,changed_at=clock_timestamp();
  ELSE DELETE FROM public.cohort_billing_managers WHERE cohort_id=_cohort AND user_id=_user; END IF;
  INSERT INTO public.audit_events(actor_id,action,entity_type,entity_id,metadata) VALUES(auth.uid(),'cohort.billing_authority_changed','cohort',_cohort::text,jsonb_build_object('user_id',_user,'allowed',_allow,'reason',btrim(_reason)));
END;
$$;
CREATE FUNCTION public.cohort_billing_management(_cohort uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
  SELECT CASE WHEN o.owner_id<>auth.uid() OR auth.uid() IS NULL THEN jsonb_build_object('can_appoint',false,'grants','[]'::jsonb,'candidates','[]'::jsonb)
  ELSE jsonb_build_object('can_appoint',true,
    'grants',coalesce((SELECT jsonb_agg(jsonb_build_object('user_id',b.user_id,'full_name',coalesce(nullif(p.full_name,''),'Manager'),'version',b.version,'reason',b.reason) ORDER BY b.user_id) FROM public.cohort_billing_managers b LEFT JOIN public.profiles p ON p.user_id=b.user_id WHERE b.cohort_id=c.id),'[]'::jsonb),
    'candidates',coalesce((SELECT jsonb_agg(jsonb_build_object('user_id',m.user_id,'full_name',coalesce(nullif(p.full_name,''),'Manager')) ORDER BY m.user_id) FROM public.organization_members m LEFT JOIN public.profiles p ON p.user_id=m.user_id WHERE m.organization_id=o.id AND m.role='manager' AND m.user_id NOT IN(o.owner_id,c.owner_id)),'[]'::jsonb)) END
  FROM public.cohorts c JOIN public.organization_cohorts oc ON oc.cohort_id=c.id JOIN public.organizations o ON o.id=oc.organization_id WHERE c.id=_cohort AND public.organization_manage(o.id)
$$;
REVOKE ALL ON FUNCTION public.set_cohort_billing_manager(uuid,uuid,boolean,integer,text),public.cohort_billing_management(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.set_cohort_billing_manager(uuid,uuid,boolean,integer,text),public.cohort_billing_management(uuid) TO authenticated;
COMMIT;
