-- Approved admin-only budget access repair.
-- Existing ledger_settings has RLS enabled but no policies or authenticated grants.
-- Permit only existing Plusticity admins to read/save the singleton budget.
-- Does not set a budget, send alerts, charge money or grant deletion access.
BEGIN;
DO $preflight$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_class WHERE oid='public.ledger_settings'::regclass AND relrowsecurity) THEN
    RAISE EXCEPTION 'Expected ledger_settings row security to be enabled';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='ledger_settings') THEN
    RAISE EXCEPTION 'Budget policies changed: review before applying';
  END IF;
END;
$preflight$;
GRANT SELECT, INSERT, UPDATE ON public.ledger_settings TO authenticated;
CREATE POLICY ledger_settings_admin_read ON public.ledger_settings
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role));
CREATE POLICY ledger_settings_admin_insert ON public.ledger_settings
  FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));
CREATE POLICY ledger_settings_admin_update ON public.ledger_settings
  FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));
COMMIT;
