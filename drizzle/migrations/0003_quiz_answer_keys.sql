REVOKE INSERT ON public.quiz_attempts FROM authenticated;
CREATE TABLE public.studio_quiz_answers (
  lesson_id uuid PRIMARY KEY REFERENCES public.studio_lessons(id) ON DELETE CASCADE,
  course_id uuid NOT NULL REFERENCES public.studio_courses(id) ON DELETE CASCADE,
  answers integer[] NOT NULL DEFAULT '{}'
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.studio_quiz_answers TO authenticated;
GRANT ALL ON public.studio_quiz_answers TO service_role;
ALTER TABLE public.studio_quiz_answers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "authors manage answer keys" ON public.studio_quiz_answers FOR ALL TO authenticated USING (public.studio_course_owned(course_id)) WITH CHECK (public.studio_course_owned(course_id));