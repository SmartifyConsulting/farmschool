BEGIN;

ALTER TABLE public.studio_courses
  ADD COLUMN price_cents integer NOT NULL DEFAULT 0 CHECK (price_cents >= 0),
  ADD COLUMN currency text NOT NULL DEFAULT 'usd' CHECK (currency ~ '^[a-z]{3}$');

CREATE TABLE public.course_enrollments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  course_id uuid NOT NULL REFERENCES public.studio_courses(id) ON DELETE CASCADE,
  amount_cents integer NOT NULL DEFAULT 0 CHECK (amount_cents >= 0),
  currency text NOT NULL DEFAULT 'usd',
  stripe_session_id text UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, course_id)
);
GRANT SELECT ON public.course_enrollments TO authenticated;
GRANT ALL ON public.course_enrollments TO service_role;
ALTER TABLE public.course_enrollments ENABLE ROW LEVEL SECURITY;

-- Enrollments are written only by the checkout-session and Stripe-webhook server functions
-- (service role), never directly by a client, so a paid course can't be unlocked by an insert.
CREATE POLICY "Learners read own enrollments" ON public.course_enrollments
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Authors read enrollments on own courses" ON public.course_enrollments
  FOR SELECT TO authenticated USING (public.studio_course_owned(course_id));

COMMIT;
