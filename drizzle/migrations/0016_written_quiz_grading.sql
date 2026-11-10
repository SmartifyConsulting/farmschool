
BEGIN;

CREATE TABLE IF NOT EXISTS public.written_quiz_usage (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  usage_day date NOT NULL,
  requests integer NOT NULL CHECK (requests BETWEEN 1 AND 10),
  PRIMARY KEY (user_id, usage_day)
);
ALTER TABLE public.written_quiz_usage ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.written_quiz_usage FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.written_quiz_reserve_request(_user_id uuid)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE used integer;
BEGIN
  INSERT INTO public.written_quiz_usage AS usage (user_id, usage_day, requests)
  VALUES (_user_id, (now() AT TIME ZONE 'UTC')::date, 1)
  ON CONFLICT (user_id, usage_day) DO UPDATE
  SET requests = usage.requests + 1 WHERE usage.requests < 10
  RETURNING requests INTO used;
  RETURN coalesce(used, 0);
END;
$$;
REVOKE ALL ON FUNCTION public.written_quiz_reserve_request(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.written_quiz_reserve_request(uuid) TO service_role;

COMMIT;
