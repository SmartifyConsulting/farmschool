-- Course Factory publishing gate. Apply to the database that hosts Studio.
-- Review approvals can only be created via the SECURITY DEFINER RPC.
CREATE TABLE IF NOT EXISTS public.studio_review_approvals (
  course_id uuid PRIMARY KEY REFERENCES public.studio_courses(id) ON DELETE CASCADE,
  reviewer_id uuid NOT NULL,
  approved_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.studio_review_approvals ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.studio_review_approvals FROM anon, authenticated;
GRANT ALL ON public.studio_review_approvals TO service_role;

CREATE OR REPLACE FUNCTION public.studio_approve_review(_course_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.studio_courses WHERE id = _course_id AND author_id = auth.uid() AND NOT published
  ) THEN RAISE EXCEPTION 'Only the author of a draft course may approve review'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.studio_lessons WHERE course_id = _course_id) THEN
    RAISE EXCEPTION 'A course must contain lessons before approval'; END IF;
  IF EXISTS (SELECT 1 FROM public.studio_lessons WHERE course_id = _course_id AND body ILIKE '%Review required before publishing.%') THEN
    RAISE EXCEPTION 'Resolve all imported lesson review notices before approval'; END IF;
  IF EXISTS (
    SELECT 1 FROM public.studio_lessons l
    LEFT JOIN public.studio_quiz_answers a ON a.lesson_id = l.id
    WHERE l.course_id = _course_id AND l.kind = 'quiz'
      AND (jsonb_array_length(l.quiz) = 0 OR a.lesson_id IS NULL
        OR jsonb_array_length(to_jsonb(a.answers)) <> jsonb_array_length(l.quiz))
  ) THEN RAISE EXCEPTION 'All quizzes require complete reviewed answer keys'; END IF;
  INSERT INTO public.studio_review_approvals(course_id, reviewer_id, approved_at)
  VALUES (_course_id, auth.uid(), now())
  ON CONFLICT (course_id) DO UPDATE SET reviewer_id = EXCLUDED.reviewer_id, approved_at = now();
END $$;
REVOKE ALL ON FUNCTION public.studio_approve_review(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.studio_approve_review(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.studio_invalidate_review() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  DELETE FROM public.studio_review_approvals WHERE course_id = COALESCE(NEW.course_id, OLD.course_id);
  RETURN COALESCE(NEW, OLD);
END $$;
CREATE TRIGGER studio_lesson_review_invalidated
AFTER INSERT OR UPDATE OR DELETE ON public.studio_lessons
FOR EACH ROW EXECUTE FUNCTION public.studio_invalidate_review();

CREATE OR REPLACE FUNCTION public.studio_invalidate_answer_review() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  DELETE FROM public.studio_review_approvals WHERE course_id = COALESCE(NEW.course_id, OLD.course_id);
  RETURN COALESCE(NEW, OLD);
END $$;
CREATE TRIGGER studio_answers_review_invalidated
AFTER INSERT OR UPDATE OR DELETE ON public.studio_quiz_answers
FOR EACH ROW EXECUTE FUNCTION public.studio_invalidate_answer_review();

CREATE OR REPLACE FUNCTION public.studio_enforce_publishing_review() RETURNS trigger
LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.published AND NOT OLD.published THEN
    IF NOT EXISTS (SELECT 1 FROM public.studio_review_approvals WHERE course_id = NEW.id AND reviewer_id = NEW.author_id) THEN
      RAISE EXCEPTION 'Trainer review approval required before publishing'; END IF;
    IF EXISTS (SELECT 1 FROM public.studio_lessons WHERE course_id = NEW.id AND body ILIKE '%Review required before publishing.%') THEN
      RAISE EXCEPTION 'Unreviewed source content cannot be published'; END IF;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER studio_publishing_review_gate BEFORE UPDATE OF published ON public.studio_courses
FOR EACH ROW EXECUTE FUNCTION public.studio_enforce_publishing_review();
