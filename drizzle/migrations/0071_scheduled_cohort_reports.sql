BEGIN;
CREATE TABLE public.cohort_report_schedules (
  cohort_id uuid PRIMARY KEY REFERENCES public.organization_cohorts(cohort_id) ON DELETE CASCADE,
  enabled boolean NOT NULL DEFAULT false, interval_minutes integer NOT NULL DEFAULT 1440 CHECK(interval_minutes BETWEEN 60 AND 43200),
  version integer NOT NULL DEFAULT 1, changed_by uuid NOT NULL, next_run timestamptz NOT NULL DEFAULT clock_timestamp(),
  last_run timestamptz, last_status text
);
CREATE TABLE public.cohort_report_snapshots (
  id uuid PRIMARY KEY, cohort_id uuid NOT NULL REFERENCES public.organization_cohorts(cohort_id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(), actor_id uuid, scheduled boolean NOT NULL, schedule_version integer,
  report jsonb NOT NULL
);
CREATE INDEX cohort_report_snapshots_retention ON public.cohort_report_snapshots(created_at);
ALTER TABLE public.cohort_report_schedules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cohort_report_snapshots ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.cohort_report_schedules,public.cohort_report_snapshots FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.cohort_report_schedules TO authenticated;
GRANT ALL ON public.cohort_report_schedules,public.cohort_report_snapshots TO service_role;
CREATE POLICY company_report_schedule_read ON public.cohort_report_schedules FOR SELECT TO authenticated USING(EXISTS(SELECT 1 FROM public.organization_cohorts oc WHERE oc.cohort_id=cohort_report_schedules.cohort_id AND public.organization_manage(oc.organization_id)));

CREATE FUNCTION public.save_cohort_report_schedule(_cohort uuid,_enabled boolean,_interval integer,_expected integer)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE existing integer; result integer;
BEGIN
  PERFORM public.organization_cohort_manage(_cohort);
  IF _enabled IS NULL OR _interval IS NULL OR _interval NOT BETWEEN 60 AND 43200 THEN RAISE EXCEPTION 'Choose a report interval from one hour to 30 days'; END IF;
  SELECT version INTO existing FROM public.cohort_report_schedules WHERE cohort_id=_cohort FOR UPDATE;
  IF coalesce(existing,0) IS DISTINCT FROM _expected THEN RAISE EXCEPTION 'Report schedule changed. Refresh before saving'; END IF;
  INSERT INTO public.cohort_report_schedules(cohort_id,enabled,interval_minutes,changed_by,next_run) VALUES(_cohort,_enabled,_interval,auth.uid(),clock_timestamp()+make_interval(mins=>_interval))
    ON CONFLICT(cohort_id) DO UPDATE SET enabled=excluded.enabled,interval_minutes=excluded.interval_minutes,changed_by=excluded.changed_by,next_run=excluded.next_run,version=cohort_report_schedules.version+1 RETURNING version INTO result;
  INSERT INTO public.audit_events(actor_id,action,entity_type,entity_id,metadata) VALUES(auth.uid(),'cohort.report_schedule_saved','cohort',_cohort::text,jsonb_build_object('enabled',_enabled,'version',result,'interval',_interval));
  RETURN result;
END;
$$;
CREATE FUNCTION public.build_company_cohort_report(_cohort uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE org_ref uuid; cohort_name text; total bigint; records jsonb;
BEGIN
  SELECT oc.organization_id,c.name INTO org_ref,cohort_name FROM public.organization_cohorts oc JOIN public.cohorts c ON c.id=oc.cohort_id WHERE oc.cohort_id=_cohort;
  IF org_ref IS NULL THEN RAISE EXCEPTION 'Company cohort required'; END IF;
  SELECT count(*) INTO total FROM public.cohort_members m JOIN public.cohort_course_assignments a ON a.cohort_id=m.cohort_id WHERE m.cohort_id=_cohort;
  IF total>10000 THEN RAISE EXCEPTION 'Report exceeds the 10000-row limit'; END IF;
  SELECT coalesce(jsonb_agg(to_jsonb(row) ORDER BY row.user_id,row.course_id),'[]'::jsonb) INTO records FROM (
    SELECT m.user_id,c.id AS course_id,coalesce(nullif(p.full_name,''),'Learner') AS learner_name,
      CASE WHEN scope.visible THEN c.title ELSE 'Course unavailable' END AS course_title,
      CASE WHEN scope.visible THEN public.effective_course_deadline(c.id,m.user_id) ELSE NULL END AS due_at,
      CASE WHEN scope.visible THEN (SELECT count(*) FROM public.studio_lessons l WHERE l.course_id=c.id) ELSE 0 END AS total_lessons,
      CASE WHEN scope.visible THEN (SELECT count(*) FROM public.lesson_progress lp JOIN public.studio_lessons l ON l.id::text=lp.lesson_id AND l.course_id=c.id WHERE lp.user_id=m.user_id AND lp.course_id=c.id::text AND lp.completed) ELSE 0 END AS completed_lessons,
      (scope.visible AND EXISTS(SELECT 1 FROM public.certificates cert WHERE cert.user_id=m.user_id AND cert.source='studio' AND cert.course_ref=c.id::text AND public.certificate_is_current(cert.id))) AS certified,
      (scope.visible AND (c.price_cents=0 OR public.course_paid_entitled(c.id,m.user_id))) AS payment_access
    FROM public.cohort_members m JOIN public.organization_members om ON om.organization_id=org_ref AND om.user_id=m.user_id
      JOIN public.cohort_course_assignments a ON a.cohort_id=m.cohort_id JOIN public.studio_courses c ON c.id=a.course_id LEFT JOIN public.profiles p ON p.user_id=m.user_id
      CROSS JOIN LATERAL (SELECT c.published AND NOT EXISTS(SELECT 1 FROM public.organization_courses oc WHERE oc.course_id=c.id AND oc.organization_id<>org_ref) AS visible) scope
    WHERE m.cohort_id=_cohort
  ) row;
  IF jsonb_array_length(records)<>total THEN RAISE EXCEPTION 'Report roster changed or contains incompatible members'; END IF;
  RETURN jsonb_build_object('name',cohort_name,'total',total,'records',records);
END;
$$;
REVOKE ALL ON FUNCTION public.build_company_cohort_report(uuid) FROM PUBLIC,anon,authenticated;

CREATE FUNCTION public.capture_company_cohort_report(_cohort uuid,_request uuid,_scheduled boolean)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE org_ref uuid; existing public.cohort_report_snapshots; schedule public.cohort_report_schedules; report jsonb;
BEGIN
  IF _request IS NULL OR _scheduled IS NULL THEN RAISE EXCEPTION 'Report request required'; END IF;
  IF NOT pg_try_advisory_xact_lock(hashtextextended('cohort-report:'||_cohort,0)) THEN RAISE EXCEPTION 'Another report is being generated. Try again shortly'; END IF;
  SELECT organization_id INTO org_ref FROM public.organization_cohorts WHERE cohort_id=_cohort;
  PERFORM 1 FROM public.organizations WHERE id=org_ref FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Company cohort required'; END IF;
  PERFORM 1 FROM public.cohorts WHERE id=_cohort FOR UPDATE;
  SELECT * INTO existing FROM public.cohort_report_snapshots WHERE id=_request;
  IF FOUND THEN
    IF existing.cohort_id<>_cohort OR existing.scheduled<>_scheduled OR existing.actor_id IS DISTINCT FROM (CASE WHEN _scheduled THEN NULL ELSE auth.uid() END) THEN RAISE EXCEPTION 'Report request changed'; END IF;
    RETURN existing.id;
  END IF;
  SELECT * INTO schedule FROM public.cohort_report_schedules WHERE cohort_id=_cohort FOR UPDATE;
  IF _scheduled AND (schedule.cohort_id IS NULL OR NOT schedule.enabled OR schedule.next_run>clock_timestamp()) THEN RETURN NULL; END IF;
  report:=public.build_company_cohort_report(_cohort);
  INSERT INTO public.cohort_report_snapshots(id,cohort_id,actor_id,scheduled,schedule_version,report) VALUES(_request,_cohort,CASE WHEN _scheduled THEN NULL ELSE auth.uid() END,_scheduled,schedule.version,report);
  UPDATE public.cohort_report_schedules SET last_run=clock_timestamp(),last_status='generated',next_run=clock_timestamp()+make_interval(mins=>interval_minutes) WHERE cohort_id=_cohort;
  DELETE FROM public.cohort_report_snapshots WHERE cohort_id=_cohort AND id IN(SELECT id FROM public.cohort_report_snapshots WHERE cohort_id=_cohort ORDER BY created_at DESC,id DESC OFFSET 30);
  INSERT INTO public.audit_events(actor_id,action,entity_type,entity_id,metadata) VALUES(CASE WHEN _scheduled THEN NULL ELSE auth.uid() END,'cohort.report_generated','cohort',_cohort::text,jsonb_build_object('report_id',_request,'rows',report->'total','scheduled',_scheduled));
  RETURN _request;
END;
$$;
REVOKE ALL ON FUNCTION public.capture_company_cohort_report(uuid,uuid,boolean) FROM PUBLIC,anon,authenticated;
CREATE FUNCTION public.generate_cohort_report_snapshot(_cohort uuid,_request uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
  PERFORM public.organization_cohort_manage(_cohort);
  RETURN public.capture_company_cohort_report(_cohort,_request,false);
END;
$$;
CREATE FUNCTION public.company_cohort_report_history(_cohort uuid)
RETURNS TABLE(id uuid,created_at timestamptz,scheduled boolean,schedule_version integer,rows integer)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
  SELECT s.id,s.created_at,s.scheduled,s.schedule_version,(s.report->>'total')::integer FROM public.cohort_report_snapshots s JOIN public.organization_cohorts oc ON oc.cohort_id=s.cohort_id
  WHERE s.cohort_id=_cohort AND s.created_at>clock_timestamp()-interval '30 days' AND public.organization_manage(oc.organization_id)
$$;
CREATE FUNCTION public.company_cohort_report_snapshot(_report uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
  SELECT s.report FROM public.cohort_report_snapshots s JOIN public.organization_cohorts oc ON oc.cohort_id=s.cohort_id WHERE s.id=_report AND s.created_at>clock_timestamp()-interval '30 days' AND public.organization_manage(oc.organization_id)
$$;
CREATE FUNCTION public.run_due_company_cohort_reports(_organization uuid DEFAULT NULL,_limit integer DEFAULT 10)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE item record; generated integer:=0; failed integer:=0; result uuid;
BEGIN
  IF _limit IS NULL OR _limit NOT BETWEEN 1 AND 10 THEN RAISE EXCEPTION 'Choose a supported report batch size'; END IF;
  DELETE FROM public.cohort_report_snapshots WHERE created_at<=clock_timestamp()-interval '30 days';
  FOR item IN SELECT s.cohort_id FROM public.cohort_report_schedules s JOIN public.organization_cohorts oc ON oc.cohort_id=s.cohort_id WHERE s.enabled AND s.next_run<=clock_timestamp() AND (_organization IS NULL OR oc.organization_id=_organization) ORDER BY s.next_run,s.cohort_id LIMIT _limit LOOP
    BEGIN
      result:=public.capture_company_cohort_report(item.cohort_id,gen_random_uuid(),true);
      IF result IS NOT NULL THEN generated:=generated+1; END IF;
    EXCEPTION WHEN OTHERS THEN
      UPDATE public.cohort_report_schedules SET last_run=clock_timestamp(),last_status='generation_failed',next_run=clock_timestamp()+make_interval(mins=>interval_minutes) WHERE cohort_id=item.cohort_id; failed:=failed+1;
    END;
  END LOOP;
  RETURN jsonb_build_object('generated',generated,'failed',failed);
END;
$$;
REVOKE ALL ON FUNCTION public.run_due_company_cohort_reports(uuid,integer) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.run_due_company_cohort_reports(uuid,integer) TO service_role;
REVOKE ALL ON FUNCTION public.save_cohort_report_schedule(uuid,boolean,integer,integer),public.generate_cohort_report_snapshot(uuid,uuid),public.company_cohort_report_history(uuid),public.company_cohort_report_snapshot(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.save_cohort_report_schedule(uuid,boolean,integer,integer),public.generate_cohort_report_snapshot(uuid,uuid),public.company_cohort_report_history(uuid),public.company_cohort_report_snapshot(uuid) TO authenticated;
SELECT cron.schedule('plusticity-company-cohort-reports','7,22,37,52 * * * *',$job$SET statement_timeout='45s'; SELECT public.run_due_company_cohort_reports(NULL,10);$job$);
CREATE FUNCTION public.company_report_scheduler_status(_organization uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
  SELECT jsonb_build_object('scheduled',EXISTS(SELECT 1 FROM cron.job WHERE jobname='plusticity-company-cohort-reports' AND active),
    'last_status',(SELECT d.status FROM cron.job_run_details d JOIN cron.job j ON j.jobid=d.jobid WHERE j.jobname='plusticity-company-cohort-reports' ORDER BY d.runid DESC LIMIT 1))
  WHERE public.organization_manage(_organization)
$$;
REVOKE ALL ON FUNCTION public.company_report_scheduler_status(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.company_report_scheduler_status(uuid) TO authenticated;
COMMIT;
