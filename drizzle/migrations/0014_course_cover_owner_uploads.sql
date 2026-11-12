DROP POLICY IF EXISTS "Authenticated upload course covers" ON storage.objects;
CREATE POLICY "Authenticated upload course covers" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'course-covers' AND (storage.foldername(name))[1] = (select auth.uid()::text));
