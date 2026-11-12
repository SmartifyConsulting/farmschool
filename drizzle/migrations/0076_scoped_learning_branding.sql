BEGIN;
CREATE FUNCTION public.learning_shell_brand(_course uuid DEFAULT NULL,_organization uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE organization_ref uuid;
BEGIN
  IF auth.uid() IS NULL THEN RETURN NULL; END IF;
  IF _course IS NOT NULL AND _organization IS NOT NULL THEN RAISE EXCEPTION 'Choose one workspace context'; END IF;
  IF _course IS NOT NULL THEN
    IF NOT public.course_catalog_visible(_course) THEN RETURN NULL; END IF;
    SELECT organization_id INTO organization_ref FROM public.organization_courses WHERE course_id=_course;
  ELSE organization_ref:=_organization;
  END IF;
  IF organization_ref IS NULL OR NOT public.organization_access(organization_ref) THEN RETURN NULL; END IF;
  RETURN (SELECT jsonb_build_object('id',id,'name',name,'color',brand_color,'logo',logo_url) FROM public.organizations WHERE id=organization_ref);
END;
$$;
REVOKE ALL ON FUNCTION public.learning_shell_brand(uuid,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.learning_shell_brand(uuid,uuid) TO authenticated;
COMMIT;
