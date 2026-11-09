CREATE TABLE public.scorm_packages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  author_id uuid NOT NULL DEFAULT auth.uid(),
  title text NOT NULL,
  scorm_version text NOT NULL DEFAULT '1.2',
  entry_path text NOT NULL,
  entry_url text NOT NULL,
  file_count integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.scorm_packages TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.scorm_packages TO authenticated;
GRANT ALL ON public.scorm_packages TO service_role;
ALTER TABLE public.scorm_packages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can view scorm packages" ON public.scorm_packages FOR SELECT USING (true);
CREATE POLICY "Authors insert own packages" ON public.scorm_packages FOR INSERT TO authenticated WITH CHECK (auth.uid() = author_id);
CREATE POLICY "Authors update own packages" ON public.scorm_packages FOR UPDATE TO authenticated USING (auth.uid() = author_id) WITH CHECK (auth.uid() = author_id);
CREATE POLICY "Authors or admins delete packages" ON public.scorm_packages FOR DELETE TO authenticated USING (auth.uid() = author_id OR public.has_role(auth.uid(), 'admin'));

CREATE TABLE public.scorm_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid(),
  package_id uuid NOT NULL REFERENCES public.scorm_packages(id) ON DELETE CASCADE,
  lesson_status text NOT NULL DEFAULT 'not attempted',
  score_raw real,
  score_max real,
  suspend_data text NOT NULL DEFAULT '',
  lesson_location text NOT NULL DEFAULT '',
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, package_id)
);
GRANT SELECT, INSERT, UPDATE ON public.scorm_attempts TO authenticated;
GRANT ALL ON public.scorm_attempts TO service_role;
ALTER TABLE public.scorm_attempts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Learners read own attempts" ON public.scorm_attempts FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Learners insert own attempts" ON public.scorm_attempts FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Learners update own attempts" ON public.scorm_attempts FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Authors read attempts on own packages" ON public.scorm_attempts FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM public.scorm_packages p WHERE p.id = package_id AND p.author_id = auth.uid()));

CREATE POLICY "Signed-in users upload scorm files" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'scorm-packages' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY "Owners delete scorm files" ON storage.objects FOR DELETE TO authenticated USING (bucket_id = 'scorm-packages' AND (storage.foldername(name))[1] = auth.uid()::text);