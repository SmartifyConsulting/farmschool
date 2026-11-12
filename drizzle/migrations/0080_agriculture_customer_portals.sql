BEGIN;
ALTER TABLE public.organization_portals ADD COLUMN agriculture_only boolean NOT NULL DEFAULT false;
CREATE FUNCTION public.is_agriculture_category(_category text)
RETURNS boolean LANGUAGE sql IMMUTABLE SET search_path='' AS $$
  SELECT coalesce(lower(btrim(split_part(_category,' / ',1)))='agriculture' OR lower(btrim(_category)) IN(
    'aquaponics','water quality','operations','market access','monitoring','crops','irrigation','livestock','soil science','farming','agriculture',
    'farm management','soil health','crop farming','poultry','horticulture','soil management','irrigation and water management','pest and disease management',
    'agricultural machinery','agribusiness and entrepreneurship','cooperative management','sustainable and climate-smart agriculture',
    'agricultural technology and innovation','food safety and post-harvest management'),false)
$$;
CREATE FUNCTION public.save_organization_portal(_organization uuid,_slug text,_enabled boolean,_message text,_expected integer,_agriculture_only boolean)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE result integer;
BEGIN
  IF _agriculture_only IS NULL THEN RAISE EXCEPTION 'Choose a valid portal training scope'; END IF;
  result:=public.save_organization_portal(_organization,_slug,_enabled,_message,_expected);
  UPDATE public.organization_portals SET agriculture_only=_agriculture_only WHERE organization_id=_organization;
  INSERT INTO public.audit_events(actor_id,action,entity_type,entity_id,metadata) VALUES(auth.uid(),'organization.portal_scope_saved','organization',_organization::text,jsonb_build_object('agriculture_only',_agriculture_only,'version',result));
  RETURN result;
END;
$$;
CREATE OR REPLACE FUNCTION public.portal_course_inventory(_organization uuid)
RETURNS SETOF uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
  WITH candidates AS (
    SELECT course_id FROM public.organization_courses WHERE organization_id=_organization
    UNION SELECT a.course_id FROM public.organization_cohorts oc JOIN public.cohort_course_assignments a ON a.cohort_id=oc.cohort_id WHERE oc.organization_id=_organization
    UNION SELECT item.value::uuid FROM public.organization_cohorts oc JOIN public.cohort_program_assignments a ON a.cohort_id=oc.cohort_id AND a.active JOIN public.learning_program_versions v ON v.id=a.version_id
      CROSS JOIN LATERAL jsonb_array_elements(v.stages) stage CROSS JOIN LATERAL jsonb_array_elements_text(stage->'course_ids') item WHERE oc.organization_id=_organization
    UNION SELECT c.id FROM public.studio_courses c WHERE public.is_agriculture_category(c.category) AND EXISTS(SELECT 1 FROM public.organization_portals p WHERE p.organization_id=_organization AND p.agriculture_only)
  ) SELECT c.id FROM candidates i JOIN public.studio_courses c ON c.id=i.course_id WHERE c.published
    AND NOT EXISTS(SELECT 1 FROM public.organization_courses own WHERE own.course_id=c.id AND own.organization_id<>_organization)
    AND (NOT EXISTS(SELECT 1 FROM public.organization_portals p WHERE p.organization_id=_organization AND p.agriculture_only) OR public.is_agriculture_category(c.category))
$$;
DO $scope$
DECLARE definition text; old text;
BEGIN
  SELECT pg_get_functiondef('public.portal_program_available(text,uuid)'::regprocedure) INTO definition;
  old:='AND p.enabled AND public.organization_access(p.organization_id)';
  IF strpos(definition,old)=0 THEN RAISE EXCEPTION 'Unexpected portal program scope'; END IF;
  EXECUTE replace(definition,old,old||' AND (NOT p.agriculture_only OR NOT EXISTS(SELECT 1 FROM jsonb_array_elements(v.stages) stage CROSS JOIN LATERAL jsonb_array_elements_text(stage->''course_ids'') item JOIN public.studio_courses c ON c.id=item.value::uuid WHERE NOT public.is_agriculture_category(c.category)))');
  SELECT pg_get_functiondef('public.portal_certificate_report(text,integer,integer)'::regprocedure) INTO definition;
  old:='WHERE c.user_id=auth.uid() AND c.source=''studio'' AND';
  IF strpos(definition,old)=0 THEN RAISE EXCEPTION 'Unexpected portal certificate scope'; END IF;
  EXECUTE replace(definition,old,old||' (NOT EXISTS(SELECT 1 FROM public.organization_portals p WHERE p.organization_id=org_ref AND p.agriculture_only) OR EXISTS(SELECT 1 FROM public.studio_courses course WHERE course.id::text=c.course_ref AND public.is_agriculture_category(course.category))) AND');
END;
$scope$;
CREATE FUNCTION public.public_portal_courses(_slug text,_query text DEFAULT '',_offset integer DEFAULT 0,_limit integer DEFAULT 24)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE org_ref uuid; total integer; records jsonb;
BEGIN
  IF _query IS NULL OR char_length(_query)>200 OR _offset IS NULL OR _offset<0 OR _limit IS NULL OR _limit NOT BETWEEN 1 AND 100 THEN RAISE EXCEPTION 'Choose a valid course page'; END IF;
  SELECT organization_id INTO org_ref FROM public.organization_portals WHERE slug=_slug AND enabled AND agriculture_only;
  IF org_ref IS NULL THEN RETURN NULL; END IF;
  WITH matched AS(SELECT c.id,c.title,c.description,c.category,c.price_cents,c.currency FROM public.portal_course_inventory(org_ref) inventory(course_id)
    JOIN public.studio_courses c ON c.id=inventory.course_id WHERE NOT EXISTS(SELECT 1 FROM public.organization_courses own WHERE own.course_id=c.id)
      AND position(lower(btrim(_query)) IN lower(c.title||' '||c.description||' '||c.category))>0),
  page AS(SELECT * FROM matched ORDER BY title,id OFFSET _offset LIMIT _limit)
  SELECT (SELECT count(*) FROM matched),coalesce((SELECT jsonb_agg(to_jsonb(page) ORDER BY title,id) FROM page),'[]'::jsonb) INTO total,records;
  RETURN jsonb_build_object('total',total,'records',records);
END;
$$;
REVOKE ALL ON FUNCTION public.is_agriculture_category(text) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.save_organization_portal(uuid,text,boolean,text,integer,boolean) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.save_organization_portal(uuid,text,boolean,text,integer,boolean) TO authenticated;
REVOKE ALL ON FUNCTION public.public_portal_courses(text,text,integer,integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.public_portal_courses(text,text,integer,integer) TO anon,authenticated;
COMMIT;
