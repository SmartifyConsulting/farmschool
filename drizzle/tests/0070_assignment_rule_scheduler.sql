BEGIN;
DO $scheduler$
BEGIN
  IF (SELECT count(*) FROM cron.job WHERE jobname='plusticity-organization-assignment-rules' AND active AND schedule='*/15 * * * *' AND command=$job$SET statement_timeout='45s'; SELECT public.run_due_organization_assignment_rules(NULL,20);$job$)<>1 THEN RAISE EXCEPTION 'Expected one bounded assignment-rule job'; END IF;
  IF has_function_privilege('authenticated','public.run_due_organization_assignment_rules(uuid,integer)','EXECUTE') OR has_function_privilege('anon','public.run_due_organization_assignment_rules(uuid,integer)','EXECUTE') THEN RAISE EXCEPTION 'Scheduler worker is publicly callable'; END IF;
END;
$scheduler$;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub',gen_random_uuid()::text,true);
DO $outsider$
BEGIN
  IF public.organization_automation_status(gen_random_uuid()) IS NOT NULL THEN RAISE EXCEPTION 'Scheduler status exposed to outsider'; END IF;
END;
$outsider$;
RESET ROLE;
ROLLBACK;
