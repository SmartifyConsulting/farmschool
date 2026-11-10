BEGIN;

CREATE TABLE public.lesson_photo_submissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid(),
  lesson_id uuid NOT NULL REFERENCES public.studio_lessons(id) ON DELETE CASCADE,
  block_index integer NOT NULL CHECK (block_index >= 0),
  photo_path text NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  trainer_note text NOT NULL DEFAULT '' CHECK (char_length(trainer_note) <= 1000),
  reviewed_by uuid,
  reviewed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, lesson_id, block_index)
);
GRANT SELECT, INSERT ON public.lesson_photo_submissions TO authenticated;
GRANT ALL ON public.lesson_photo_submissions TO service_role;
ALTER TABLE public.lesson_photo_submissions ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.lesson_photo_course_owned(_lesson uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.studio_lessons l
    JOIN public.studio_courses c ON c.id = l.course_id
    WHERE l.id = _lesson AND c.author_id = auth.uid()
  )
$$;

CREATE POLICY "Learners read own submissions" ON public.lesson_photo_submissions
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Learners insert own submissions" ON public.lesson_photo_submissions
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Trainers read submissions on own courses" ON public.lesson_photo_submissions
  FOR SELECT TO authenticated USING (public.lesson_photo_course_owned(lesson_id));

-- Resubmitting after rejection replaces the pending/rejected row; an approved sign-off is final.
CREATE OR REPLACE FUNCTION public.lesson_photo_submit(_lesson uuid, _block integer, _path text)
RETURNS public.lesson_photo_submissions LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE result public.lesson_photo_submissions;
BEGIN
  INSERT INTO public.lesson_photo_submissions AS s (user_id, lesson_id, block_index, photo_path)
  VALUES (auth.uid(), _lesson, _block, _path)
  ON CONFLICT (user_id, lesson_id, block_index) DO UPDATE
    SET photo_path = _path, status = 'pending', trainer_note = '', reviewed_by = NULL, reviewed_at = NULL
    WHERE s.status <> 'approved'
  RETURNING * INTO result;
  IF result IS NULL THEN RAISE EXCEPTION 'This task is already signed off.'; END IF;
  RETURN result;
END;
$$;
REVOKE ALL ON FUNCTION public.lesson_photo_submit(uuid, integer, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.lesson_photo_submit(uuid, integer, text) TO authenticated;

-- Only the course's trainer (author) may sign off practical evidence; clients never set their own outcome.
CREATE OR REPLACE FUNCTION public.lesson_photo_review(_submission uuid, _status text, _note text)
RETURNS public.lesson_photo_submissions LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE result public.lesson_photo_submissions;
BEGIN
  IF _status NOT IN ('approved', 'rejected') THEN RAISE EXCEPTION 'Invalid status.'; END IF;
  UPDATE public.lesson_photo_submissions s
  SET status = _status, trainer_note = coalesce(_note, ''), reviewed_by = auth.uid(), reviewed_at = now()
  WHERE s.id = _submission AND public.lesson_photo_course_owned(s.lesson_id)
  RETURNING * INTO result;
  IF result IS NULL THEN RAISE EXCEPTION 'Submission not found.'; END IF;
  RETURN result;
END;
$$;
REVOKE ALL ON FUNCTION public.lesson_photo_review(uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.lesson_photo_review(uuid, text, text) TO authenticated;

-- Private bucket: path is "<user_id>/<lesson_id>/<block_index>-<uuid>.<ext>".
INSERT INTO storage.buckets (id, name, public) VALUES ('practical-evidence', 'practical-evidence', false)
  ON CONFLICT (id) DO NOTHING;
CREATE POLICY "Learners upload own practical evidence" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'practical-evidence' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY "Learners read own practical evidence" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'practical-evidence' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY "Trainers read practical evidence on own courses" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'practical-evidence'
    AND EXISTS (
      SELECT 1 FROM public.lesson_photo_submissions s
      WHERE s.photo_path = storage.objects.name AND public.lesson_photo_course_owned(s.lesson_id)
    )
  );

COMMIT;
