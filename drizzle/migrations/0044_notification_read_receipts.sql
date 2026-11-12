BEGIN;

CREATE TABLE IF NOT EXISTS public.notification_reads (
  user_id uuid NOT NULL DEFAULT auth.uid(),
  notification_key text NOT NULL CHECK (char_length(notification_key) BETWEEN 1 AND 500),
  read_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(user_id, notification_key)
);
ALTER TABLE public.notification_reads ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.notification_reads FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON public.notification_reads TO authenticated;
GRANT ALL ON public.notification_reads TO service_role;
CREATE POLICY "Read own notification receipts" ON public.notification_reads FOR SELECT TO authenticated USING(user_id=auth.uid());
CREATE POLICY "Insert own notification receipts" ON public.notification_reads FOR INSERT TO authenticated WITH CHECK(user_id=auth.uid());
CREATE POLICY "Update own notification receipts" ON public.notification_reads FOR UPDATE TO authenticated USING(user_id=auth.uid()) WITH CHECK(user_id=auth.uid());

COMMIT;
