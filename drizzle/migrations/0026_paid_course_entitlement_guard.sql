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

-- Approved activities contain course content too; use the same entitlement
-- boundary instead of treating every published course as publicly readable.
DROP POLICY IF EXISTS studio_activities_published_read ON public.studio_learning_activities;
CREATE POLICY studio_activities_published_read
  ON public.studio_learning_activities
  FOR SELECT TO anon, authenticated
  USING (approved = true AND public.studio_course_visible(course_id));

-- External library items can reveal linked paid-course media through their
-- embed/original URLs. A learner only gets the linked item when at least one
-- entitled course references it.
CREATE OR REPLACE FUNCTION public.external_item_in_visible_course(_item uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $
  SELECT EXISTS (
    SELECT 1
    FROM public.course_external_content c
    WHERE c.item_id = _item
      AND public.studio_course_visible(c.course_id)
  )
$;

REVOKE ALL ON FUNCTION public.external_item_in_visible_course(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.external_item_in_visible_course(uuid) TO anon, authenticated, service_role;

COMMIT;
