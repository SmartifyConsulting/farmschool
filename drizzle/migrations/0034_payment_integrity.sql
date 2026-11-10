-- Preserve payment provenance and prevent replay/mismatched paid enrolments.
BEGIN;

ALTER TABLE public.course_enrollments
  ADD COLUMN IF NOT EXISTS payment_provider text,
  ADD COLUMN IF NOT EXISTS payment_status text,
  ADD COLUMN IF NOT EXISTS paid_at timestamptz;

CREATE UNIQUE INDEX IF NOT EXISTS course_enrollments_stripe_session_unique
  ON public.course_enrollments(stripe_session_id)
  WHERE stripe_session_id IS NOT NULL;

ALTER TABLE public.course_enrollments
  DROP CONSTRAINT IF EXISTS course_enrollments_payment_status_check,
  ADD CONSTRAINT course_enrollments_payment_status_check
    CHECK (payment_status IS NULL OR payment_status IN ('free','paid','refunded','disputed'));

CREATE TABLE IF NOT EXISTS public.payment_events (
  id text PRIMARY KEY,
  provider text NOT NULL,
  event_type text NOT NULL,
  received_at timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz,
  status text NOT NULL DEFAULT 'received',
  error text
);
ALTER TABLE public.payment_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.payment_events FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.payment_events TO service_role;

COMMIT;
