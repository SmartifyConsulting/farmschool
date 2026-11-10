BEGIN;

ALTER TABLE public.profiles
  ADD COLUMN bio text NOT NULL DEFAULT '' CHECK (char_length(bio) <= 2000),
  ADD COLUMN avatar_url text;

-- Public read (so avatars show anywhere in the app), write restricted to the owner's own folder.
INSERT INTO storage.buckets (id, name, public) VALUES ('avatars', 'avatars', true)
  ON CONFLICT (id) DO NOTHING;
CREATE POLICY "Avatars are publicly readable" ON storage.objects
  FOR SELECT TO authenticated, anon
  USING (bucket_id = 'avatars');
CREATE POLICY "Users upload their own avatar" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'avatars' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY "Users replace their own avatar" ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id = 'avatars' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY "Users delete their own avatar" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'avatars' AND (storage.foldername(name))[1] = auth.uid()::text);

-- A read-only "token ledger" for the signed-in user's own AI usage, combining the existing
-- per-feature daily-quota tables (which otherwise have no client-readable grant at all).
CREATE OR REPLACE FUNCTION public.my_ai_usage()
RETURNS TABLE(feature text, usage_day date, requests integer)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT 'Course factory' AS feature, usage_day, requests FROM public.course_factory_ai_usage WHERE user_id = auth.uid()
  UNION ALL
  SELECT 'Written-quiz grading', usage_day, requests FROM public.written_quiz_usage WHERE user_id = auth.uid()
  UNION ALL
  SELECT 'Lesson tutor', usage_day, requests FROM public.lesson_tutor_usage WHERE user_id = auth.uid()
  ORDER BY usage_day DESC
$$;
REVOKE ALL ON FUNCTION public.my_ai_usage() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.my_ai_usage() TO authenticated;

COMMIT;
