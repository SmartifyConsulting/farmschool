-- Resolve whether a signed-in learner may launch a SCORM package.
-- A package is accessible to its author, or when it is attached to at least
-- one Studio lesson whose course is visible to the current user.
BEGIN;

CREATE OR REPLACE FUNCTION public.scorm_package_visible(_package uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.scorm_packages p
    WHERE p.id = _package
      AND (
        p.author_id = auth.uid()
        OR EXISTS (
          SELECT 1
          FROM public.studio_lessons l
          WHERE l.kind = 'scorm'
            AND l.body LIKE ('scorm:' || _package::text || '%')
            AND public.studio_course_visible(l.course_id)
        )
      )
  )
$$;

REVOKE ALL ON FUNCTION public.scorm_package_visible(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.scorm_package_visible(uuid) TO authenticated, service_role;

DROP POLICY IF EXISTS "Anyone can view scorm packages" ON public.scorm_packages;
DROP POLICY IF EXISTS "Entitled learners view scorm packages" ON public.scorm_packages;
CREATE POLICY "Entitled learners view scorm packages"
  ON public.scorm_packages
  FOR SELECT TO authenticated
  USING (public.scorm_package_visible(id));

REVOKE SELECT ON public.scorm_packages FROM anon;

COMMIT;
