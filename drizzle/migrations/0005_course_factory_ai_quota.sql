-- Atomic per-user Course Factory AI quota. Apply in the same Supabase database as Studio.
CREATE TABLE IF NOT EXISTS public.course_factory_ai_usage (
  user_id uuid NOT NULL,
  usage_day date NOT NULL,
  requests integer NOT NULL DEFAULT 0 CHECK (requests BETWEEN 0 AND 20),
  PRIMARY KEY (user_id, usage_day)
);
ALTER TABLE public.course_factory_ai_usage ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.course_factory_ai_usage FROM anon, authenticated;
GRANT ALL ON public.course_factory_ai_usage TO service_role;

CREATE OR REPLACE FUNCTION public.course_factory_reserve_ai_request()
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _count integer;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
  INSERT INTO public.course_factory_ai_usage(user_id, usage_day, requests)
  VALUES (auth.uid(), (now() AT TIME ZONE 'UTC')::date, 1)
  ON CONFLICT (user_id, usage_day) DO UPDATE
    SET requests = public.course_factory_ai_usage.requests + 1
    WHERE public.course_factory_ai_usage.requests < 20
  RETURNING requests INTO _count;
  IF _count IS NULL THEN RAISE EXCEPTION 'Daily AI generation limit reached (20 requests)'; END IF;
  RETURN _count;
END $$;
REVOKE ALL ON FUNCTION public.course_factory_reserve_ai_request() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.course_factory_reserve_ai_request() TO authenticated;
