-- Enforce paid-course access in Postgres rather than relying on UI locks.
-- Free published courses remain openly readable. Authors retain access to drafts
-- and their own paid courses. Paid learners require an enrollment row.
BEGIN;

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
          AND (
            c.price_cents = 0
            OR (
              auth.uid() IS NOT NULL
              AND EXISTS (
                SELECT 1
                FROM public.course_enrollments e
                WHERE e.course_id = c.id
                  AND e.user_id = auth.uid()
              )
            )
          )
        )
      )
  )
$$;

REVOKE ALL ON FUNCTION public.studio_course_visible(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.studio_course_visible(uuid) TO anon, authenticated, service_role;

-- Course metadata remains discoverable for catalogue/checkout. Lesson/content
-- policies already call studio_course_visible(), so paid course bodies are now
-- protected at the database boundary.

COMMIT;
