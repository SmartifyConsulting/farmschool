-- Prevent clients from recording completion against arbitrary Studio lesson IDs.
-- Catalogue courses use application-owned string IDs and remain supported.
BEGIN;

CREATE OR REPLACE FUNCTION public.valid_lesson_progress_target(_course text, _lesson text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT CASE
    -- UUID course references are Studio courses and must resolve to an entitled
    -- lesson. Catalogue course refs are non-UUID application-owned identifiers.
    WHEN _course ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
      THEN EXISTS (
        SELECT 1
        FROM public.studio_lessons l
        WHERE l.course_id = _course::uuid
          AND l.id::text = _lesson
          AND public.studio_course_visible(l.course_id)
      )
    ELSE char_length(_course) BETWEEN 1 AND 80
      AND char_length(_lesson) BETWEEN 1 AND 120
  END
$$;

REVOKE ALL ON FUNCTION public.valid_lesson_progress_target(text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.valid_lesson_progress_target(text, text) TO authenticated, service_role;

DROP POLICY IF EXISTS "own progress" ON public.lesson_progress;
CREATE POLICY "read own progress"
  ON public.lesson_progress FOR SELECT TO authenticated
  USING (auth.uid() = user_id);
CREATE POLICY "insert valid own progress"
  ON public.lesson_progress FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() = user_id
    AND public.valid_lesson_progress_target(course_id, lesson_id)
    AND position_seconds >= 0
  );
CREATE POLICY "update valid own progress"
  ON public.lesson_progress FOR UPDATE TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (
    auth.uid() = user_id
    AND public.valid_lesson_progress_target(course_id, lesson_id)
    AND position_seconds >= 0
  );
CREATE POLICY "delete own progress"
  ON public.lesson_progress FOR DELETE TO authenticated
  USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS lesson_progress_user_course_completed_idx
  ON public.lesson_progress(user_id, course_id, completed);
CREATE INDEX IF NOT EXISTS quiz_attempts_user_course_passed_idx
  ON public.quiz_attempts(user_id, course_id, passed, lesson_id);
CREATE INDEX IF NOT EXISTS certificates_user_issued_idx
  ON public.certificates(user_id, issued_at DESC);
CREATE INDEX IF NOT EXISTS course_enrollments_course_user_idx
  ON public.course_enrollments(course_id, user_id);
CREATE INDEX IF NOT EXISTS scorm_attempts_user_status_idx
  ON public.scorm_attempts(user_id, lesson_status, package_id);

COMMIT;
