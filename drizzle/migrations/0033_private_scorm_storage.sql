-- SCORM courseware must not be directly downloadable from a public storage URL.
BEGIN;

UPDATE storage.buckets
SET public = false
WHERE id = 'scorm-packages';

DROP POLICY IF EXISTS "Public read scorm files" ON storage.objects;
DROP POLICY IF EXISTS "Anyone can read scorm files" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users read scorm files" ON storage.objects;

-- Authors may upload/delete their own package files. Learner reads are served only
-- through the authenticated /api/scorm-file proxy after course entitlement checks.
CREATE POLICY "Owners read own scorm files"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'scorm-packages'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

COMMIT;
