BEGIN;
DO $fixture$
DECLARE admin_id uuid;
BEGIN
  SELECT user_id INTO admin_id FROM public.user_roles WHERE role='admin' LIMIT 1;
  IF admin_id IS NULL THEN RAISE EXCEPTION 'An existing admin fixture is required'; END IF;
  PERFORM set_config('request.jwt.claim.sub',admin_id::text,true);
END;
$fixture$;
SET LOCAL ROLE authenticated;
INSERT INTO public.ledger_settings(id,monthly_budget_usd,alert_at_percent)
  VALUES(true,NULL,80) ON CONFLICT(id) DO NOTHING;
DO $admin_check$
BEGIN
  IF NOT EXISTS(SELECT 1 FROM public.ledger_settings WHERE id) THEN
    RAISE EXCEPTION 'Admin cannot read the budget';
  END IF;
  UPDATE public.ledger_settings SET alert_at_percent=81 WHERE id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Admin cannot update the budget'; END IF;
END;
$admin_check$;
RESET ROLE;
SELECT set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000001',true);
SET LOCAL ROLE authenticated;
DO $nonadmin_check$
BEGIN
  IF EXISTS(SELECT 1 FROM public.ledger_settings) THEN
    RAISE EXCEPTION 'A non-admin can read the budget';
  END IF;
  UPDATE public.ledger_settings SET alert_at_percent=82 WHERE id;
  IF FOUND THEN RAISE EXCEPTION 'A non-admin can update the budget'; END IF;
  BEGIN
    INSERT INTO public.ledger_settings(id,monthly_budget_usd,alert_at_percent)
      VALUES(true,1,80) ON CONFLICT(id) DO UPDATE SET alert_at_percent=80;
    RAISE EXCEPTION 'A non-admin can insert or upsert the budget';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
END;
$nonadmin_check$;
RESET ROLE;
SET LOCAL ROLE anon;
DO $anonymous_check$
BEGIN
  BEGIN
    PERFORM 1 FROM public.ledger_settings;
    RAISE EXCEPTION 'Anonymous budget access is granted';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
END;
$anonymous_check$;
ROLLBACK;
