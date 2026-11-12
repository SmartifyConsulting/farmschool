BEGIN;
CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA pg_catalog;
SELECT cron.schedule('plusticity-organization-assignment-rules','*/15 * * * *',$job$SET statement_timeout='45s'; SELECT public.run_due_organization_assignment_rules(NULL,20);$job$);
CREATE OR REPLACE FUNCTION public.organization_automation_status(_organization uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
  SELECT jsonb_build_object(
    'scheduled',EXISTS(SELECT 1 FROM cron.job WHERE jobname='plusticity-organization-assignment-rules' AND active),
    'last_run',(SELECT last_run FROM public.organization_automation_health WHERE id),
    'last_cron_status',(SELECT d.status FROM cron.job_run_details d JOIN cron.job j ON j.jobid=d.jobid WHERE j.jobname='plusticity-organization-assignment-rules' ORDER BY d.runid DESC LIMIT 1)
  ) WHERE public.organization_manage(_organization)
$$;
REVOKE ALL ON FUNCTION public.organization_automation_status(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.organization_automation_status(uuid) TO authenticated;
COMMIT;
