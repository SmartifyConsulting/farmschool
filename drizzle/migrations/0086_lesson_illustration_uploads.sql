BEGIN;

-- Public bucket for trainer-uploaded illustration/preview media attached to a draft lesson during
-- Course Factory review. Preview only for now — not yet carried through to the published lesson.
-- Path is "<author_id>/<uuid>-<file_name>" — write/delete restricted to the uploader's folder.
INSERT INTO storage.buckets (id, name, public) VALUES ('lesson-illustrations', 'lesson-illustrations', true)
  ON CONFLICT (id) DO NOTHING;
CREATE POLICY "Lesson illustrations are publicly readable" ON storage.objects
  FOR SELECT TO authenticated, anon
  USING (bucket_id = 'lesson-illustrations');
CREATE POLICY "Trainers upload their own lesson illustrations" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'lesson-illustrations' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY "Trainers delete their own lesson illustrations" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'lesson-illustrations' AND (storage.foldername(name))[1] = auth.uid()::text);

COMMIT;
