CREATE TABLE public.studio_courses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  author_id uuid NOT NULL DEFAULT auth.uid(),
  title text NOT NULL CHECK (char_length(title) BETWEEN 3 AND 120),
  description text NOT NULL DEFAULT '' CHECK (char_length(description) <= 4000),
  category text NOT NULL DEFAULT 'Farm Management' CHECK (char_length(category) <= 80),
  level text NOT NULL DEFAULT 'Beginner' CHECK (level IN ('Beginner','Intermediate','Advanced')),
  cover_url text CHECK (cover_url IS NULL OR cover_url ~ '^https://'),
  published boolean NOT NULL DEFAULT false,
  moodle_id integer,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.studio_courses TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.studio_courses TO authenticated;
GRANT ALL ON public.studio_courses TO service_role;
ALTER TABLE public.studio_courses ENABLE ROW LEVEL SECURITY;
CREATE POLICY "read published courses" ON public.studio_courses FOR SELECT TO anon, authenticated USING (published);
CREATE POLICY "authors read own courses" ON public.studio_courses FOR SELECT TO authenticated USING (auth.uid() = author_id);
CREATE POLICY "authors insert" ON public.studio_courses FOR INSERT TO authenticated WITH CHECK (auth.uid() = author_id);
CREATE POLICY "authors update" ON public.studio_courses FOR UPDATE TO authenticated USING (auth.uid() = author_id) WITH CHECK (auth.uid() = author_id);
CREATE POLICY "authors delete" ON public.studio_courses FOR DELETE TO authenticated USING (auth.uid() = author_id);
CREATE TRIGGER studio_courses_touch BEFORE UPDATE ON public.studio_courses FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE TABLE public.studio_lessons (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id uuid NOT NULL REFERENCES public.studio_courses(id) ON DELETE CASCADE,
  position integer NOT NULL DEFAULT 0,
  kind text NOT NULL DEFAULT 'video' CHECK (kind IN ('video','reading','quiz')),
  title text NOT NULL CHECK (char_length(title) BETWEEN 1 AND 120),
  video_url text CHECK (video_url IS NULL OR video_url ~ '^https://'),
  body text NOT NULL DEFAULT '' CHECK (char_length(body) <= 20000),
  quiz jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.studio_lessons TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.studio_lessons TO authenticated;
GRANT ALL ON public.studio_lessons TO service_role;
ALTER TABLE public.studio_lessons ENABLE ROW LEVEL SECURITY;
CREATE OR REPLACE FUNCTION public.studio_course_visible(_course uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.studio_courses WHERE id = _course AND (published OR author_id = auth.uid()))
$$;
CREATE OR REPLACE FUNCTION public.studio_course_owned(_course uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.studio_courses WHERE id = _course AND author_id = auth.uid())
$$;
CREATE POLICY "read lessons of visible courses" ON public.studio_lessons FOR SELECT TO anon, authenticated USING (public.studio_course_visible(course_id));
CREATE POLICY "authors write lessons" ON public.studio_lessons FOR ALL TO authenticated USING (public.studio_course_owned(course_id)) WITH CHECK (public.studio_course_owned(course_id));

CREATE TABLE public.quiz_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid(),
  course_id text NOT NULL,
  lesson_id text NOT NULL,
  score integer NOT NULL CHECK (score BETWEEN 0 AND 100),
  passed boolean NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.quiz_attempts TO authenticated;
GRANT ALL ON public.quiz_attempts TO service_role;
ALTER TABLE public.quiz_attempts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own attempts" ON public.quiz_attempts FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE TABLE public.moodle_enrolments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  moodle_id integer NOT NULL,
  progress integer NOT NULL DEFAULT 0,
  completed boolean NOT NULL DEFAULT false,
  synced_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, moodle_id)
);
GRANT SELECT ON public.moodle_enrolments TO authenticated;
GRANT ALL ON public.moodle_enrolments TO service_role;
ALTER TABLE public.moodle_enrolments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own enrolments" ON public.moodle_enrolments FOR SELECT TO authenticated USING (auth.uid() = user_id);

CREATE TABLE public.certificates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  source text NOT NULL CHECK (source IN ('studio','moodle','catalogue')),
  course_ref text NOT NULL,
  title text NOT NULL,
  issued_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, source, course_ref)
);
GRANT SELECT ON public.certificates TO authenticated;
GRANT ALL ON public.certificates TO service_role;
ALTER TABLE public.certificates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own certificates" ON public.certificates FOR SELECT TO authenticated USING (auth.uid() = user_id);