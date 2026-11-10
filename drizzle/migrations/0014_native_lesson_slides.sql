
BEGIN;

ALTER TABLE public.studio_lessons
  DROP CONSTRAINT IF EXISTS studio_lessons_kind_check;

ALTER TABLE public.studio_lessons
  ADD CONSTRAINT studio_lessons_kind_check
  CHECK (kind IN ('video', 'reading', 'quiz', 'scorm', 'slide'));

CREATE TABLE IF NOT EXISTS public.lesson_tutor_usage (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  usage_day date NOT NULL,
  requests integer NOT NULL CHECK (requests BETWEEN 1 AND 20),
  PRIMARY KEY (user_id, usage_day)
);
ALTER TABLE public.lesson_tutor_usage ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.lesson_tutor_usage FROM anon, authenticated;

CREATE OR REPLACE FUNCTION public.lesson_tutor_reserve_request()
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE used integer;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
  INSERT INTO public.lesson_tutor_usage AS usage (user_id, usage_day, requests)
  VALUES (auth.uid(), (now() AT TIME ZONE 'UTC')::date, 1)
  ON CONFLICT (user_id, usage_day) DO UPDATE
  SET requests = usage.requests + 1 WHERE usage.requests < 20
  RETURNING requests INTO used;
  RETURN coalesce(used, 0);
END;
$$;
REVOKE ALL ON FUNCTION public.lesson_tutor_reserve_request() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.lesson_tutor_reserve_request() TO authenticated;

COMMIT;
