BEGIN;

CREATE TABLE public.studio_content_files (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id uuid NOT NULL REFERENCES public.studio_courses(id) ON DELETE CASCADE,
  module_id uuid REFERENCES public.studio_modules(id) ON DELETE SET NULL,
  file_name text NOT NULL CHECK (char_length(file_name) <= 200),
  file_type text NOT NULL CHECK (file_type IN ('video', 'pdf', 'text', 'scorm')),
  storage_path text NOT NULL,
  size_bytes bigint NOT NULL CHECK (size_bytes >= 0),
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.studio_content_files TO authenticated;
GRANT ALL ON public.studio_content_files TO service_role;
ALTER TABLE public.studio_content_files ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Trainers manage content on own courses" ON public.studio_content_files
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.studio_courses c WHERE c.id = course_id AND c.author_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.studio_courses c WHERE c.id = course_id AND c.author_id = auth.uid()));

-- Private bucket: path is "<author_id>/<course_id>/<uuid>-<file_name>".
INSERT INTO storage.buckets (id, name, public) VALUES ('studio-content', 'studio-content', false)
  ON CONFLICT (id) DO NOTHING;
CREATE POLICY "Trainers upload own course content" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'studio-content' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY "Trainers read own course content" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'studio-content' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY "Trainers delete own course content" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'studio-content' AND (storage.foldername(name))[1] = auth.uid()::text);

COMMIT;
