BEGIN;
CREATE TABLE public.organization_certificate_settings (
  organization_id uuid PRIMARY KEY REFERENCES public.organizations(id),
  heading text NOT NULL DEFAULT 'Certificate of Completion' CHECK(char_length(btrim(heading)) BETWEEN 1 AND 200),
  signatory_name text NOT NULL DEFAULT '' CHECK(char_length(signatory_name)<=200),
  signatory_title text NOT NULL DEFAULT '' CHECK(char_length(signatory_title)<=200),
  footer text NOT NULL DEFAULT '' CHECK(char_length(footer)<=1000),
  version integer NOT NULL DEFAULT 1
);
CREATE TABLE public.certificate_brand_snapshots (
  certificate_id uuid PRIMARY KEY REFERENCES public.certificates(id), organization_id uuid NOT NULL REFERENCES public.organizations(id),
  issuer_name text NOT NULL, color text NOT NULL, logo text, heading text NOT NULL,
  signatory_name text NOT NULL, signatory_title text NOT NULL, footer text NOT NULL, template_version integer NOT NULL,
  recorded_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
ALTER TABLE public.organization_certificate_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.certificate_brand_snapshots ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.organization_certificate_settings,public.certificate_brand_snapshots FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.organization_certificate_settings TO authenticated;
GRANT ALL ON public.organization_certificate_settings TO service_role;
GRANT SELECT,INSERT ON public.certificate_brand_snapshots TO service_role;
CREATE POLICY certificate_settings_manager_read ON public.organization_certificate_settings FOR SELECT TO authenticated USING(public.organization_manage(organization_id));
CREATE FUNCTION public.save_organization_certificate_settings(_organization uuid,_heading text,_signatory_name text,_signatory_title text,_footer text,_expected integer)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE previous integer; result integer;
BEGIN
  PERFORM 1 FROM public.organizations WHERE id=_organization FOR UPDATE;
  IF NOT FOUND OR NOT public.organization_manage(_organization) THEN RAISE EXCEPTION 'Organization management access required'; END IF;
  IF _heading IS NULL OR char_length(btrim(_heading)) NOT BETWEEN 1 AND 200 OR _signatory_name IS NULL OR char_length(_signatory_name)>200 OR _signatory_title IS NULL OR char_length(_signatory_title)>200 OR _footer IS NULL OR char_length(_footer)>1000 THEN RAISE EXCEPTION 'Choose valid certificate wording'; END IF;
  SELECT version INTO previous FROM public.organization_certificate_settings WHERE organization_id=_organization FOR UPDATE;
  IF coalesce(previous,0) IS DISTINCT FROM _expected THEN RAISE EXCEPTION 'Certificate settings changed. Refresh before saving'; END IF;
  INSERT INTO public.organization_certificate_settings(organization_id,heading,signatory_name,signatory_title,footer) VALUES(_organization,btrim(_heading),btrim(_signatory_name),btrim(_signatory_title),btrim(_footer))
    ON CONFLICT(organization_id) DO UPDATE SET heading=excluded.heading,signatory_name=excluded.signatory_name,signatory_title=excluded.signatory_title,footer=excluded.footer,version=organization_certificate_settings.version+1 RETURNING version INTO result;
  INSERT INTO public.audit_events(actor_id,action,entity_type,entity_id,metadata) VALUES(auth.uid(),'organization.certificate_template_saved','organization',_organization::text,jsonb_build_object('version',result));
  RETURN result;
END;
$$;
CREATE FUNCTION public.capture_certificate_brand(_certificate uuid,_organization uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE cert public.certificates; org public.organizations; template public.organization_certificate_settings;
BEGIN
  SELECT * INTO cert FROM public.certificates WHERE id=_certificate FOR UPDATE;
  IF NOT FOUND OR cert.source<>'studio' OR cert.validated_at IS NULL OR cert.revoked_at IS NOT NULL OR NOT public.organization_user_access(_organization,cert.user_id) THEN RETURN; END IF;
  SELECT * INTO org FROM public.organizations WHERE id=_organization FOR SHARE;
  IF NOT FOUND THEN RETURN; END IF;
  SELECT * INTO template FROM public.organization_certificate_settings WHERE organization_id=_organization FOR SHARE;
  INSERT INTO public.certificate_brand_snapshots(certificate_id,organization_id,issuer_name,color,logo,heading,signatory_name,signatory_title,footer,template_version)
    VALUES(cert.id,org.id,org.name,org.brand_color,org.logo_url,coalesce(template.heading,'Certificate of Completion'),coalesce(template.signatory_name,''),coalesce(template.signatory_title,''),coalesce(template.footer,''),coalesce(template.version,0))
    ON CONFLICT(certificate_id) DO NOTHING;
END;
$$;
CREATE FUNCTION public.capture_course_certificate_brand()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE org_ref uuid;
BEGIN
  IF NEW.source='studio' AND NEW.validated_at IS NOT NULL THEN
    SELECT organization_id INTO org_ref FROM public.organization_courses WHERE course_id::text=NEW.course_ref;
    IF org_ref IS NOT NULL THEN PERFORM public.capture_certificate_brand(NEW.id,org_ref); END IF;
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER certificate_capture_brand AFTER INSERT ON public.certificates FOR EACH ROW EXECUTE FUNCTION public.capture_course_certificate_brand();
CREATE FUNCTION public.certificate_brand_immutable()
RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$ BEGIN RAISE EXCEPTION 'Awarded certificate branding is immutable'; END; $$;
CREATE TRIGGER certificate_brand_no_change BEFORE UPDATE OR DELETE ON public.certificate_brand_snapshots FOR EACH ROW EXECUTE FUNCTION public.certificate_brand_immutable();
CREATE FUNCTION public.issue_studio_certificate(_user uuid,_course uuid,_expected_version integer,_expected_lessons jsonb,_photo_tasks jsonb,_portal_slug text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE result jsonb; existing uuid; org_ref uuid; previous_sub text:=current_setting('request.jwt.claim.sub',true);
BEGIN
  PERFORM 1 FROM public.studio_courses WHERE id=_course FOR UPDATE;
  SELECT id INTO existing FROM public.certificates WHERE user_id=_user AND source='studio' AND course_ref=_course::text FOR UPDATE;
  IF _portal_slug IS NOT NULL THEN
    SELECT organization_id INTO org_ref FROM public.organization_portals WHERE slug=_portal_slug AND enabled FOR SHARE;
    PERFORM set_config('request.jwt.claim.sub',_user::text,true);
    IF org_ref IS NULL OR public.portal_learning_brand(_portal_slug,_course) IS NULL THEN RAISE EXCEPTION 'This course is not available through your training portal'; END IF;
    PERFORM set_config('request.jwt.claim.sub',coalesce(previous_sub,''),true);
  END IF;
  result:=public.issue_studio_certificate(_user,_course,_expected_version,_expected_lessons,_photo_tasks);
  IF existing IS NULL AND org_ref IS NOT NULL THEN PERFORM public.capture_certificate_brand((result->>'id')::uuid,org_ref); END IF;
  RETURN result;
END;
$$;
CREATE FUNCTION public.my_certificate_brand(_certificate uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
  SELECT jsonb_build_object('issuer_name',b.issuer_name,'color',b.color,'logo',b.logo,'heading',b.heading,'signatory_name',b.signatory_name,'signatory_title',b.signatory_title,'footer',b.footer,'template_version',b.template_version)
  FROM public.certificate_brand_snapshots b JOIN public.certificates c ON c.id=b.certificate_id WHERE c.id=_certificate AND c.user_id=auth.uid()
$$;
CREATE FUNCTION public.portal_certificate_report(_slug text,_offset integer DEFAULT 0,_limit integer DEFAULT 24)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE org_ref uuid; records jsonb; total integer;
BEGIN
  SELECT organization_id INTO org_ref FROM public.organization_portals WHERE slug=_slug AND enabled;
  IF org_ref IS NULL OR NOT public.organization_access(org_ref) THEN RAISE EXCEPTION 'Your account needs membership in this training portal'; END IF;
  IF _offset IS NULL OR _offset<0 OR _limit IS NULL OR _limit NOT BETWEEN 1 AND 100 THEN RAISE EXCEPTION 'Choose a valid certificate page'; END IF;
  WITH matched AS(SELECT c.* FROM public.certificates c LEFT JOIN public.certificate_brand_snapshots b ON b.certificate_id=c.id WHERE c.user_id=auth.uid() AND c.source='studio' AND
    (b.organization_id=org_ref OR (b.certificate_id IS NULL AND (EXISTS(SELECT 1 FROM public.organization_courses own WHERE own.organization_id=org_ref AND own.course_id::text=c.course_ref) OR EXISTS(SELECT 1 FROM public.portal_course_inventory(org_ref) inventory(course_id) WHERE inventory.course_id::text=c.course_ref))))),
  page AS(SELECT id,title,source,course_ref,issued_at,course_version,validated_at,revoked_at,revocation_reason,public.certificate_effective_expiry(id) AS expires_at FROM matched ORDER BY issued_at DESC,id OFFSET _offset LIMIT _limit)
  SELECT (SELECT count(*) FROM matched),coalesce((SELECT jsonb_agg(to_jsonb(page) ORDER BY issued_at DESC,id) FROM page),'[]'::jsonb) INTO total,records;
  RETURN jsonb_build_object('total',total,'records',records);
END;
$$;
CREATE OR REPLACE FUNCTION public.verify_certificate(_token uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
  SELECT jsonb_build_object('title',c.title,'learner_name',s.learner_name,'source',c.source,'issued_at',c.issued_at,'validated_at',c.validated_at,
    'revoked_at',c.revoked_at,'expires_at',public.certificate_effective_expiry(c.id),'course_version',c.course_version,
    'renewed_at',(SELECT max(r.completed_at) FROM public.certificate_renewals r WHERE r.certificate_id=c.id),
    'issuer',CASE WHEN b.certificate_id IS NULL THEN NULL ELSE jsonb_build_object('issuer_name',b.issuer_name,'color',b.color,'logo',b.logo,'heading',b.heading,'signatory_name',b.signatory_name,'signatory_title',b.signatory_title,'footer',b.footer,'template_version',b.template_version) END)
  FROM public.certificate_shares s JOIN public.certificates c ON c.id=s.certificate_id LEFT JOIN public.certificate_brand_snapshots b ON b.certificate_id=c.id WHERE s.token=_token AND s.enabled
$$;
REVOKE ALL ON FUNCTION public.capture_certificate_brand(uuid,uuid),public.capture_course_certificate_brand(),public.certificate_brand_immutable() FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.save_organization_certificate_settings(uuid,text,text,text,text,integer),public.my_certificate_brand(uuid),public.portal_certificate_report(text,integer,integer) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.save_organization_certificate_settings(uuid,text,text,text,text,integer),public.my_certificate_brand(uuid),public.portal_certificate_report(text,integer,integer) TO authenticated;
REVOKE ALL ON FUNCTION public.issue_studio_certificate(uuid,uuid,integer,jsonb,jsonb,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.issue_studio_certificate(uuid,uuid,integer,jsonb,jsonb,text) TO service_role;
COMMIT;
