DO $$
DECLARE definition text;
BEGIN
  SELECT pg_get_functiondef('public.studio_publish_version(uuid,text)'::regprocedure) INTO definition;
  IF position('IF NOT EXISTS(SELECT 1 FROM public.creator_applications WHERE user_id=auth.uid() AND status=''approved'') THEN' in definition) = 0 THEN
    RAISE EXCEPTION 'Expected creator approval guard not found';
  END IF;
  definition := replace(definition,
    'IF NOT EXISTS(SELECT 1 FROM public.creator_applications WHERE user_id=auth.uid() AND status=''approved'') THEN',
    'IF NOT public.has_role(auth.uid(), ''admin'') AND NOT EXISTS(SELECT 1 FROM public.creator_applications WHERE user_id=auth.uid() AND status=''approved'') THEN');
  EXECUTE definition;
END;
$$;