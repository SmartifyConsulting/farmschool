BEGIN;
CREATE FUNCTION public.server_certificate_records()
RETURNS TABLE(id uuid,user_id uuid,source text,course_ref text,title text,issued_at timestamptz,revoked_at timestamptz,expires_at timestamptz,current_valid boolean)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
  SELECT c.id,c.user_id,c.source,c.course_ref,c.title,c.issued_at,c.revoked_at,public.certificate_effective_expiry(c.id),public.certificate_is_current(c.id)
  FROM public.certificates c
$$;
REVOKE ALL ON FUNCTION public.server_certificate_records() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.server_certificate_records() TO service_role;
DO $analytics$
DECLARE definition text; old text:='SELECT count(*) FROM public.certificates WHERE source = ''studio''';
BEGIN
  SELECT pg_get_functiondef('public.admin_platform_analytics()'::regprocedure) INTO definition;
  IF strpos(definition,old)=0 THEN RAISE EXCEPTION 'Unexpected platform certificate aggregate'; END IF;
  EXECUTE replace(definition,old,'SELECT count(*) FROM public.certificates c WHERE source = ''studio'' AND public.certificate_is_current(c.id)');
END;
$analytics$;
COMMIT;
