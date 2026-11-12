BEGIN;

SELECT set_config('test.notification_owner',gen_random_uuid()::text,true);
SELECT set_config('test.notification_other',gen_random_uuid()::text,true);
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub',current_setting('test.notification_owner'),true);
INSERT INTO public.notification_reads(notification_key) VALUES('rollback-test-notice');
UPDATE public.notification_reads SET read_at=now() WHERE notification_key='rollback-test-notice';
DO $owner$
BEGIN
  IF (SELECT count(*) FROM public.notification_reads WHERE notification_key='rollback-test-notice') <> 1 THEN
    RAISE EXCEPTION 'Owner cannot read notification receipt';
  END IF;
  BEGIN
    INSERT INTO public.notification_reads(user_id,notification_key)
    VALUES(current_setting('test.notification_other')::uuid,'forged-receipt');
    RAISE EXCEPTION 'Cross-user insert unexpectedly allowed';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
END;
$owner$;
SELECT set_config('request.jwt.claim.sub',current_setting('test.notification_other'),true);
DO $other$
BEGIN
  IF EXISTS(SELECT 1 FROM public.notification_reads WHERE notification_key='rollback-test-notice') THEN
    RAISE EXCEPTION 'Cross-user receipt read unexpectedly allowed';
  END IF;
  UPDATE public.notification_reads SET read_at=now() WHERE notification_key='rollback-test-notice';
  IF FOUND THEN RAISE EXCEPTION 'Cross-user receipt update unexpectedly allowed'; END IF;
END;
$other$;
RESET ROLE;

ROLLBACK;
