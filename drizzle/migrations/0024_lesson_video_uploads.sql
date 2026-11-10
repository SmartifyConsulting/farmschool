BEGIN;

-- Public bucket so the learner's <video> tag can stream the file directly, no auth round-trip.
-- Path is "<author_id>/<course_id>/<uuid>-<file_name>" — write is restricted to the uploader's folder.
INSERT INTO storage.buckets (id, name, public) VALUES ('lesson-videos', 'lesson-videos', true)
  ON CONFLICT (id) DO NOTHING;
CREATE POLICY "Lesson videos are publicly readable" ON storage.objects
  FOR SELECT TO authenticated, anon
  USING (bucket_id = 'lesson-videos');
CREATE POLICY "Trainers upload their own lesson videos" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'lesson-videos' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY "Trainers delete their own lesson videos" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'lesson-videos' AND (storage.foldername(name))[1] = auth.uid()::text);

COMMIT;
