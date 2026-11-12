DROP POLICY IF EXISTS "Avatars are publicly readable" ON storage.objects;
DROP POLICY IF EXISTS "Public read course covers" ON storage.objects;
CREATE POLICY "Users read their own avatar files" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'avatars' AND (storage.foldername(name))[1] = (auth.uid())::text);
CREATE POLICY "Owners read their course cover files" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'course-covers' AND owner = auth.uid());