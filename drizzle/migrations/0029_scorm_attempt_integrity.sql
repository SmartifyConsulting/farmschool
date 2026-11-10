-- SCORM is client-reported by design, but attempts must be limited to the
-- signed-in learner, an entitled package and sane persisted values.
BEGIN;

ALTER TABLE public.scorm_attempts
  DROP CONSTRAINT IF EXISTS scorm_attempts_status_check,
  ADD CONSTRAINT scorm_attempts_status_check
    CHECK (lesson_status IN ('not attempted','incomplete','completed','passed','failed','browsed','unknown')),
  DROP CONSTRAINT IF EXISTS scorm_attempts_score_raw_check,
  ADD CONSTRAINT scorm_attempts_score_raw_check
    CHECK (score_raw IS NULL OR (score_raw >= -1000000 AND score_raw <= 1000000)),
  DROP CONSTRAINT IF EXISTS scorm_attempts_score_max_check,
  ADD CONSTRAINT scorm_attempts_score_max_check
    CHECK (score_max IS NULL OR (score_max >= 0 AND score_max <= 1000000)),
  DROP CONSTRAINT IF EXISTS scorm_attempts_suspend_data_size,
  ADD CONSTRAINT scorm_attempts_suspend_data_size
    CHECK (octet_length(suspend_data) <= 262144),
  DROP CONSTRAINT IF EXISTS scorm_attempts_location_size,
  ADD CONSTRAINT scorm_attempts_location_size
    CHECK (octet_length(lesson_location) <= 8192);

DROP POLICY IF EXISTS "Learners insert own attempts" ON public.scorm_attempts;
CREATE POLICY "Learners insert entitled attempts"
  ON public.scorm_attempts FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() = user_id
    AND public.scorm_package_visible(package_id)
  );

DROP POLICY IF EXISTS "Learners update own attempts" ON public.scorm_attempts;
CREATE POLICY "Learners update entitled attempts"
  ON public.scorm_attempts FOR UPDATE TO authenticated
  USING (auth.uid() = user_id AND public.scorm_package_visible(package_id))
  WITH CHECK (auth.uid() = user_id AND public.scorm_package_visible(package_id));

COMMIT;
