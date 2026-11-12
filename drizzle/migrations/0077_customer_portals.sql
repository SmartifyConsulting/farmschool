BEGIN;
CREATE TABLE public.organization_portals (
  organization_id uuid PRIMARY KEY REFERENCES public.organizations(id), slug text NOT NULL UNIQUE CHECK(slug ~ '^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$'),
  enabled boolean NOT NULL DEFAULT false, public_message text NOT NULL DEFAULT 'Sign in to access your training.' CHECK(char_length(public_message)<=2000), version integer NOT NULL DEFAULT 1
);
ALTER TABLE public.organization_portals ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.organization_portals FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.organization_portals TO authenticated;
GRANT ALL ON public.organization_portals TO service_role;
CREATE POLICY portal_manager_read ON public.organization_portals FOR SELECT TO authenticated USING(public.organization_manage(organization_id));
CREATE FUNCTION public.save_organization_portal(_organization uuid,_slug text,_enabled boolean,_message text,_expected integer)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE previous public.organization_portals; result integer;
BEGIN
  PERFORM 1 FROM public.organizations WHERE id=_organization FOR UPDATE;
  IF NOT FOUND OR NOT public.organization_manage(_organization) THEN RAISE EXCEPTION 'Organization management access required'; END IF;
  IF _slug IS NULL OR _slug !~ '^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$' OR _slug IN('admin','plusticity','support','login','api') OR _enabled IS NULL OR _message IS NULL OR char_length(_message)>2000 THEN RAISE EXCEPTION 'Choose a valid portal address and welcome message'; END IF;
  SELECT * INTO previous FROM public.organization_portals WHERE organization_id=_organization FOR UPDATE;
  IF coalesce(previous.version,0) IS DISTINCT FROM _expected THEN RAISE EXCEPTION 'Portal settings changed. Refresh before saving'; END IF;
  IF previous.slug IS NOT NULL AND previous.slug<>_slug THEN RAISE EXCEPTION 'A portal address is permanent. Disable the portal if it is no longer needed'; END IF;
  IF EXISTS(SELECT 1 FROM public.organization_portals WHERE slug=_slug AND organization_id<>_organization) THEN RAISE EXCEPTION 'This portal address is already reserved'; END IF;
  INSERT INTO public.organization_portals(organization_id,slug,enabled,public_message) VALUES(_organization,_slug,_enabled,btrim(_message))
    ON CONFLICT(organization_id) DO UPDATE SET enabled=excluded.enabled,public_message=excluded.public_message,version=organization_portals.version+1 RETURNING version INTO result;
  INSERT INTO public.audit_events(actor_id,action,entity_type,entity_id,metadata) VALUES(auth.uid(),'organization.portal_saved','organization',_organization::text,jsonb_build_object('slug',_slug,'enabled',_enabled,'version',result));
  RETURN result;
END;
$$;
CREATE FUNCTION public.organization_portal(_slug text)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
  SELECT jsonb_build_object('slug',p.slug,'message',p.public_message,'brand',jsonb_build_object('id',o.id,'name',o.name,'color',o.brand_color,'logo',o.logo_url,'portalSlug',p.slug))
  FROM public.organization_portals p JOIN public.organizations o ON o.id=p.organization_id WHERE p.slug=_slug AND p.enabled
$$;
REVOKE ALL ON FUNCTION public.save_organization_portal(uuid,text,boolean,text,integer) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.save_organization_portal(uuid,text,boolean,text,integer) TO authenticated;
REVOKE ALL ON FUNCTION public.organization_portal(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.organization_portal(text) TO anon,authenticated;

CREATE FUNCTION public.portal_course_inventory(_organization uuid)
RETURNS SETOF uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
  WITH candidates AS (
    SELECT course_id FROM public.organization_courses WHERE organization_id=_organization
    UNION SELECT a.course_id FROM public.organization_cohorts oc JOIN public.cohort_course_assignments a ON a.cohort_id=oc.cohort_id WHERE oc.organization_id=_organization
    UNION SELECT item.value::uuid FROM public.organization_cohorts oc JOIN public.cohort_program_assignments a ON a.cohort_id=oc.cohort_id AND a.active JOIN public.learning_program_versions v ON v.id=a.version_id
      CROSS JOIN LATERAL jsonb_array_elements(v.stages) stage CROSS JOIN LATERAL jsonb_array_elements_text(stage->'course_ids') item WHERE oc.organization_id=_organization
  ) SELECT c.id FROM candidates i JOIN public.studio_courses c ON c.id=i.course_id WHERE c.published AND NOT EXISTS(SELECT 1 FROM public.organization_courses own WHERE own.course_id=c.id AND own.organization_id<>_organization)
$$;
REVOKE ALL ON FUNCTION public.portal_course_inventory(uuid) FROM PUBLIC,anon,authenticated,service_role;
CREATE FUNCTION public.portal_course_report(_slug text,_learning boolean DEFAULT false,_query text DEFAULT '',_offset integer DEFAULT 0,_limit integer DEFAULT 24)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE org_ref uuid; total integer; records jsonb;
BEGIN
  SELECT organization_id INTO org_ref FROM public.organization_portals WHERE slug=_slug AND enabled;
  IF org_ref IS NULL OR NOT public.organization_access(org_ref) THEN RAISE EXCEPTION 'Your account needs membership in this training portal'; END IF;
  IF _learning IS NULL OR _offset IS NULL OR _offset<0 OR _limit IS NULL OR _limit NOT BETWEEN 1 AND 100 OR _query IS NULL OR char_length(_query)>200 THEN RAISE EXCEPTION 'Choose a valid portal search page'; END IF;
  WITH my_groups AS(SELECT oc.cohort_id FROM public.organization_cohorts oc JOIN public.cohort_members m ON m.cohort_id=oc.cohort_id AND m.user_id=auth.uid() WHERE oc.organization_id=org_ref),
  assigned AS(SELECT a.course_id FROM public.cohort_course_assignments a JOIN my_groups g ON g.cohort_id=a.cohort_id
    UNION SELECT item.value::uuid FROM my_groups g JOIN public.cohort_program_assignments a ON a.cohort_id=g.cohort_id AND a.active JOIN public.learning_program_versions v ON v.id=a.version_id CROSS JOIN LATERAL jsonb_array_elements(v.stages) stage CROSS JOIN LATERAL jsonb_array_elements_text(stage->'course_ids') item),
  matched AS(SELECT c.*,EXISTS(SELECT 1 FROM assigned a WHERE a.course_id=c.id) AS assigned FROM public.portal_course_inventory(org_ref) inventory(id) JOIN public.studio_courses c ON c.id=inventory.id
    WHERE public.course_catalog_visible(c.id) AND position(lower(btrim(_query)) IN lower(c.title||' '||c.description))>0
      AND (NOT _learning OR EXISTS(SELECT 1 FROM assigned a WHERE a.course_id=c.id) OR EXISTS(SELECT 1 FROM public.lesson_progress p WHERE p.user_id=auth.uid() AND p.course_id=c.id::text)
        OR EXISTS(SELECT 1 FROM public.course_enrollments e WHERE e.user_id=auth.uid() AND e.course_id=c.id AND (e.payment_status IS NULL OR e.payment_status IN('paid','free')))
        OR EXISTS(SELECT 1 FROM public.certificates cert WHERE cert.user_id=auth.uid() AND cert.source='studio' AND cert.course_ref=c.id::text)
        OR (c.price_cents>0 AND public.course_paid_entitled(c.id,auth.uid())))),
  page AS(SELECT c.id,c.title,c.description,c.cover_url,c.price_cents,c.currency,c.assigned,
    (SELECT count(*) FROM public.studio_lessons l WHERE l.course_id=c.id) AS total_lessons,
    (SELECT count(*) FROM public.lesson_progress p JOIN public.studio_lessons l ON l.id::text=p.lesson_id AND l.course_id=c.id WHERE p.user_id=auth.uid() AND p.course_id=c.id::text AND p.completed) AS completed_lessons,
    EXISTS(SELECT 1 FROM public.certificates cert WHERE cert.user_id=auth.uid() AND cert.source='studio' AND cert.course_ref=c.id::text AND public.certificate_is_current(cert.id)) AS certified,
    public.studio_course_visible(c.id) AS access FROM matched c ORDER BY c.title,c.id OFFSET _offset LIMIT _limit)
  SELECT (SELECT count(*) FROM matched),coalesce((SELECT jsonb_agg(to_jsonb(page) ORDER BY title,id) FROM page),'[]'::jsonb) INTO total,records;
  RETURN jsonb_build_object('organization_id',org_ref,'can_manage',public.organization_manage(org_ref),'total',total,'records',records);
END;
$$;
CREATE FUNCTION public.portal_learning_brand(_slug text,_course uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE portal jsonb; org_ref uuid;
BEGIN
  portal:=public.organization_portal(_slug); org_ref:=(portal->'brand'->>'id')::uuid;
  IF org_ref IS NULL OR NOT public.organization_access(org_ref) THEN RETURN NULL; END IF;
  IF _course IS NOT NULL AND (NOT public.course_catalog_visible(_course) OR NOT EXISTS(SELECT 1 FROM public.portal_course_inventory(org_ref) inventory(course_id) WHERE inventory.course_id=_course)) THEN RETURN NULL; END IF;
  RETURN portal->'brand';
END;
$$;
REVOKE ALL ON FUNCTION public.portal_course_report(text,boolean,text,integer,integer),public.portal_learning_brand(text,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.portal_course_report(text,boolean,text,integer,integer),public.portal_learning_brand(text,uuid) TO authenticated;
COMMIT;
