-- Peer assessment / workshop module: learners submit work for a course,
-- the author assigns each submission to a few other submitters to review
-- against a rubric, and submissions receive a calibrated average score.

CREATE TABLE public.peer_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id uuid NOT NULL REFERENCES public.studio_courses(id) ON DELETE CASCADE,
  author_id uuid NOT NULL DEFAULT auth.uid(),
  title text NOT NULL CHECK (char_length(btrim(title)) BETWEEN 3 AND 200),
  instructions text NOT NULL DEFAULT '' CHECK (char_length(instructions) <= 8000),
  rubric jsonb NOT NULL CHECK (jsonb_typeof(rubric) = 'array' AND jsonb_array_length(rubric) BETWEEN 1 AND 20),
  reviews_required int NOT NULL DEFAULT 2 CHECK (reviews_required BETWEEN 1 AND 5),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.peer_submissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  assignment_id uuid NOT NULL REFERENCES public.peer_assignments(id) ON DELETE CASCADE,
  user_id uuid NOT NULL DEFAULT auth.uid(),
  body text NOT NULL CHECK (char_length(btrim(body)) BETWEEN 1 AND 8000),
  submitted_at timestamptz NOT NULL DEFAULT now(),
  review_count int NOT NULL DEFAULT 0,
  calibrated_score numeric,
  UNIQUE (assignment_id, user_id)
);

CREATE TABLE public.peer_review_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  peer_assignment_id uuid NOT NULL REFERENCES public.peer_assignments(id) ON DELETE CASCADE,
  submission_id uuid NOT NULL REFERENCES public.peer_submissions(id) ON DELETE CASCADE,
  reviewer_id uuid NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','completed')),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (submission_id, reviewer_id)
);

CREATE TABLE public.peer_reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  review_assignment_id uuid NOT NULL UNIQUE REFERENCES public.peer_review_assignments(id) ON DELETE CASCADE,
  marks jsonb NOT NULL CHECK (jsonb_typeof(marks) = 'object'),
  comment text NOT NULL DEFAULT '' CHECK (char_length(comment) <= 4000),
  score numeric NOT NULL,
  max_points numeric NOT NULL,
  submitted_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX peer_submissions_assignment_idx ON public.peer_submissions(assignment_id);
CREATE INDEX peer_review_assignments_reviewer_idx ON public.peer_review_assignments(reviewer_id, status);
CREATE INDEX peer_review_assignments_submission_idx ON public.peer_review_assignments(submission_id);

ALTER TABLE public.peer_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.peer_submissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.peer_review_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.peer_reviews ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT ON public.peer_assignments TO authenticated;
GRANT SELECT, INSERT ON public.peer_submissions TO authenticated;
GRANT SELECT ON public.peer_review_assignments TO authenticated;
GRANT SELECT, INSERT ON public.peer_reviews TO authenticated;
GRANT ALL ON public.peer_assignments, public.peer_submissions, public.peer_review_assignments, public.peer_reviews TO service_role;

-- A course member is the course's author, or a learner assigned the course through a cohort.
CREATE OR REPLACE FUNCTION public.peer_course_member(_course_id uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.studio_courses c WHERE c.id = _course_id AND c.author_id = auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.cohort_members cm
      JOIN public.cohort_course_assignments cca ON cca.cohort_id = cm.cohort_id
      WHERE cca.course_id = _course_id AND cm.user_id = auth.uid()
    );
$$;

CREATE POLICY "Course members read peer assignments" ON public.peer_assignments
  FOR SELECT TO authenticated USING (public.peer_course_member(course_id));

CREATE POLICY "Course authors create peer assignments" ON public.peer_assignments
  FOR INSERT TO authenticated
  WITH CHECK (
    author_id = auth.uid()
    AND EXISTS (SELECT 1 FROM public.studio_courses c WHERE c.id = course_id AND c.author_id = auth.uid())
  );

CREATE POLICY "Involved people read submissions" ON public.peer_submissions
  FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    OR EXISTS (SELECT 1 FROM public.peer_assignments a WHERE a.id = assignment_id AND a.author_id = auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.peer_review_assignments ra
      WHERE ra.submission_id = peer_submissions.id AND ra.reviewer_id = auth.uid()
    )
  );

CREATE POLICY "Course members submit their own work" ON public.peer_submissions
  FOR INSERT TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND EXISTS (SELECT 1 FROM public.peer_assignments a WHERE a.id = assignment_id AND public.peer_course_member(a.course_id))
  );

CREATE POLICY "Reviewer and author read review assignments" ON public.peer_review_assignments
  FOR SELECT TO authenticated
  USING (
    reviewer_id = auth.uid()
    OR EXISTS (SELECT 1 FROM public.peer_assignments a WHERE a.id = peer_assignment_id AND a.author_id = auth.uid())
  );

CREATE POLICY "Involved people read reviews" ON public.peer_reviews
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.peer_review_assignments ra
      JOIN public.peer_submissions s ON s.id = ra.submission_id
      JOIN public.peer_assignments a ON a.id = ra.peer_assignment_id
      WHERE ra.id = review_assignment_id
        AND (ra.reviewer_id = auth.uid() OR s.user_id = auth.uid() OR a.author_id = auth.uid())
    )
  );

CREATE POLICY "Reviewers submit their assigned review" ON public.peer_reviews
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.peer_review_assignments ra
      WHERE ra.id = review_assignment_id AND ra.reviewer_id = auth.uid() AND ra.status = 'pending'
    )
  );

CREATE OR REPLACE FUNCTION public.peer_review_commit() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _submission uuid;
BEGIN
  UPDATE public.peer_review_assignments SET status = 'completed' WHERE id = NEW.review_assignment_id
    RETURNING submission_id INTO _submission;
  UPDATE public.peer_submissions s SET
    review_count = (SELECT count(*) FROM public.peer_reviews r
      JOIN public.peer_review_assignments ra ON ra.id = r.review_assignment_id
      WHERE ra.submission_id = _submission),
    calibrated_score = (SELECT avg(r.score / NULLIF(r.max_points, 0) * 100) FROM public.peer_reviews r
      JOIN public.peer_review_assignments ra ON ra.id = r.review_assignment_id
      WHERE ra.submission_id = _submission)
  WHERE s.id = _submission;
  RETURN NEW;
END;
$$;

CREATE TRIGGER peer_review_commits_submission
  AFTER INSERT ON public.peer_reviews
  FOR EACH ROW EXECUTE FUNCTION public.peer_review_commit();

-- Author-triggered: for every submission in the assignment, randomly assign
-- `reviews_required` distinct peer reviewers (any other submitter), skipping
-- pairs that already exist.
CREATE OR REPLACE FUNCTION public.peer_assign_reviewers(_assignment_id uuid) RETURNS int
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _needed int; _created int := 0; _sub record; _reviewer uuid;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.peer_assignments WHERE id = _assignment_id AND author_id = auth.uid()) THEN
    RAISE EXCEPTION 'Only the assignment author can assign reviewers.';
  END IF;
  SELECT reviews_required INTO _needed FROM public.peer_assignments WHERE id = _assignment_id;
  FOR _sub IN SELECT id, user_id FROM public.peer_submissions WHERE assignment_id = _assignment_id LOOP
    FOR _reviewer IN
      SELECT user_id FROM public.peer_submissions
      WHERE assignment_id = _assignment_id
        AND user_id <> _sub.user_id
        AND user_id NOT IN (
          SELECT reviewer_id FROM public.peer_review_assignments WHERE submission_id = _sub.id
        )
      ORDER BY random()
      LIMIT GREATEST(_needed - (
        SELECT count(*) FROM public.peer_review_assignments WHERE submission_id = _sub.id
      ), 0)
    LOOP
      INSERT INTO public.peer_review_assignments (peer_assignment_id, submission_id, reviewer_id)
      VALUES (_assignment_id, _sub.id, _reviewer)
      ON CONFLICT DO NOTHING;
      _created := _created + 1;
    END LOOP;
  END LOOP;
  RETURN _created;
END;
$$;
GRANT EXECUTE ON FUNCTION public.peer_assign_reviewers(uuid) TO authenticated;

-- Reviewer's own queue: which review assignments are pending for them, with
-- enough context (submission text, rubric) to score without extra round trips.
CREATE OR REPLACE FUNCTION public.my_peer_review_queue() RETURNS TABLE(
  review_assignment_id uuid,
  assignment_id uuid,
  assignment_title text,
  rubric jsonb,
  submission_id uuid,
  submission_body text,
  status text
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT ra.id, a.id, a.title, a.rubric, s.id, s.body, ra.status
  FROM public.peer_review_assignments ra
  JOIN public.peer_submissions s ON s.id = ra.submission_id
  JOIN public.peer_assignments a ON a.id = ra.peer_assignment_id
  WHERE ra.reviewer_id = auth.uid()
  ORDER BY ra.status, ra.created_at;
$$;
GRANT EXECUTE ON FUNCTION public.my_peer_review_queue() TO authenticated;
