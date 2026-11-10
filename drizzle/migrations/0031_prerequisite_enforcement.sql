-- Enforce Studio course prerequisites at the database visibility boundary.
BEGIN;

CREATE OR REPLACE FUNCTION public.studio_prerequisite_satisfied(_course uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT COALESCE((
    SELECT c.prerequisite_course_id IS NULL
      OR c.author_id = auth.uid()
      OR EXISTS (
        SELECT 1
        FROM public.certificates cert
        WHERE cert.user_id = auth.uid()
          AND cert.source = 'studio'
          AND cert.course_ref = c.prerequisite_course_id::text
      )
    FROM public.studio_courses c
    WHERE c.id = _course
  ), false)
$$;

REVOKE ALL ON FUNCTION public.studio_prerequisite_satisfied(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.studio_prerequisite_satisfied(uuid) TO anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.studio_course_visible(_course uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.studio_courses c
    WHERE c.id = _course
      AND (
        c.author_id = auth.uid()
        OR (
          c.published
          AND public.studio_prerequisite_satisfied(c.id)
          AND (
            c.price_cents = 0
            OR (
              auth.uid() IS NOT NULL
              AND EXISTS (
                SELECT 1
                FROM public.course_enrollments e
                WHERE e.course_id = c.id AND e.user_id = auth.uid()
              )
            )
          )
        )
      )
  )
$$;

COMMIT;
