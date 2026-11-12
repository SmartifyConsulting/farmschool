BEGIN;

CREATE TABLE public.cohort_email_preferences (
  user_id uuid PRIMARY KEY DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  enabled boolean NOT NULL DEFAULT true
);
ALTER TABLE public.cohort_email_preferences ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.cohort_email_preferences FROM anon,authenticated;
GRANT SELECT,INSERT,UPDATE ON public.cohort_email_preferences TO authenticated;
CREATE POLICY own_cohort_email_preferences ON public.cohort_email_preferences FOR ALL TO authenticated USING(user_id=auth.uid()) WITH CHECK(user_id=auth.uid());

CREATE TABLE public.cohort_reminder_outbox (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_key text NOT NULL UNIQUE,
  cohort_id uuid NOT NULL REFERENCES public.cohorts(id) ON DELETE CASCADE,
  course_id uuid NOT NULL REFERENCES public.studio_courses(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  kind text NOT NULL CHECK(kind IN('assigned','due-soon','overdue')),
  assigned_at timestamptz NOT NULL,
  due_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  status text NOT NULL DEFAULT 'pending' CHECK(status IN('pending','processing','sent','failed','cancelled')),
  attempts integer NOT NULL DEFAULT 0,
  lease uuid,
  locked_at timestamptz,
  first_attempt_at timestamptz,
  not_before timestamptz NOT NULL DEFAULT now(),
  sent_at timestamptz,
  provider_id text,
  payload jsonb,
  last_error text
);
CREATE INDEX cohort_reminder_pending ON public.cohort_reminder_outbox(status,not_before,created_at);
ALTER TABLE public.cohort_reminder_outbox ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.cohort_reminder_outbox FROM PUBLIC,anon,authenticated;
GRANT ALL ON public.cohort_reminder_outbox TO service_role;

CREATE FUNCTION public.cohort_reminder_eligible(_job public.cohort_reminder_outbox)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
  SELECT EXISTS(SELECT 1 FROM public.cohorts c
    JOIN public.cohort_members m ON m.cohort_id=c.id AND m.user_id=_job.user_id
    JOIN public.cohort_course_assignments a ON a.cohort_id=c.id AND a.course_id=_job.course_id
    JOIN public.studio_courses s ON s.id=a.course_id
    JOIN auth.users u ON u.id=m.user_id
    LEFT JOIN public.cohort_email_preferences p ON p.user_id=m.user_id
    WHERE c.id=_job.cohort_id AND c.reminders_enabled AND public.has_role(c.owner_id,'admin') AND coalesce(p.enabled,true)
      AND s.published AND s.revision_of IS NULL AND a.assigned_at=_job.assigned_at
      AND public.effective_course_deadline(a.course_id,m.user_id) IS NOT DISTINCT FROM _job.due_at
      AND u.email IS NOT NULL AND u.email_confirmed_at IS NOT NULL AND u.deleted_at IS NULL
      AND (_job.payload IS NULL OR _job.payload->>'recipient'=u.email)
      AND _job.kind=CASE WHEN _job.due_at<clock_timestamp() THEN 'overdue' WHEN _job.due_at<=clock_timestamp()+interval '7 days' THEN 'due-soon' ELSE 'assigned' END
      AND NOT EXISTS(SELECT 1 FROM public.certificates cert WHERE cert.user_id=m.user_id AND cert.source='studio' AND cert.course_ref=s.id::text AND cert.revoked_at IS NULL))
$$;
REVOKE ALL ON FUNCTION public.cohort_reminder_eligible(public.cohort_reminder_outbox) FROM PUBLIC,anon,authenticated;

CREATE FUNCTION public.enqueue_cohort_reminders(_cohort uuid DEFAULT NULL)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE inserted integer;
BEGIN
  UPDATE public.cohort_reminder_outbox j SET status='cancelled',lease=NULL WHERE (_cohort IS NULL OR cohort_id=_cohort) AND status IN('pending','processing') AND NOT public.cohort_reminder_eligible(j);
  UPDATE public.cohort_reminder_outbox SET status='failed',lease=NULL,last_error='retry_window_expired'
    WHERE (_cohort IS NULL OR cohort_id=_cohort) AND status IN('pending','processing') AND (first_attempt_at<clock_timestamp()-interval '23 hours' OR (attempts>=8 AND (status='pending' OR locked_at<clock_timestamp()-interval '15 minutes')));
  INSERT INTO public.cohort_reminder_outbox(event_key,cohort_id,course_id,user_id,kind,assigned_at,due_at)
  SELECT c.id||':'||s.id||':'||m.user_id||':'||extract(epoch from a.assigned_at)||':'||coalesce(extract(epoch from deadline.due_at)::text,'none')||':'||stage.kind,
    c.id,s.id,m.user_id,stage.kind,a.assigned_at,deadline.due_at
  FROM public.cohorts c JOIN public.cohort_members m ON m.cohort_id=c.id
    JOIN public.cohort_course_assignments a ON a.cohort_id=c.id JOIN public.studio_courses s ON s.id=a.course_id JOIN auth.users u ON u.id=m.user_id
    LEFT JOIN public.cohort_email_preferences p ON p.user_id=m.user_id
    CROSS JOIN LATERAL (SELECT public.effective_course_deadline(s.id,m.user_id) AS due_at) deadline
    CROSS JOIN LATERAL (SELECT CASE WHEN deadline.due_at<clock_timestamp() THEN 'overdue' WHEN deadline.due_at<=clock_timestamp()+interval '7 days' THEN 'due-soon' ELSE 'assigned' END AS kind) stage
  WHERE (_cohort IS NULL OR c.id=_cohort) AND c.reminders_enabled AND public.has_role(c.owner_id,'admin') AND coalesce(p.enabled,true) AND s.published AND s.revision_of IS NULL
    AND u.email IS NOT NULL AND u.email_confirmed_at IS NOT NULL AND u.deleted_at IS NULL
    AND NOT EXISTS(SELECT 1 FROM public.certificates cert WHERE cert.user_id=m.user_id AND cert.source='studio' AND cert.course_ref=s.id::text AND cert.revoked_at IS NULL)
  ON CONFLICT(event_key) DO NOTHING;
  GET DIAGNOSTICS inserted=ROW_COUNT;
  RETURN inserted;
END;
$$;

CREATE FUNCTION public.claim_cohort_reminders(_limit integer DEFAULT 20,_cohort uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE job public.cohort_reminder_outbox; result jsonb:='[]'; message jsonb;
BEGIN
  IF _limit IS NULL OR _limit NOT BETWEEN 1 AND 50 THEN RAISE EXCEPTION 'Invalid reminder batch'; END IF;
  FOR job IN SELECT * FROM public.cohort_reminder_outbox
    WHERE (status='pending' OR (status='processing' AND locked_at<clock_timestamp()-interval '15 minutes'))
      AND (_cohort IS NULL OR cohort_id=_cohort)
      AND not_before<=clock_timestamp() AND attempts<8 AND (first_attempt_at IS NULL OR first_attempt_at>clock_timestamp()-interval '23 hours')
    ORDER BY created_at,id LIMIT _limit FOR UPDATE SKIP LOCKED LOOP
    IF NOT public.cohort_reminder_eligible(job) THEN UPDATE public.cohort_reminder_outbox SET status='cancelled',lease=NULL WHERE id=job.id; CONTINUE; END IF;
    message:=job.payload;
    IF message IS NULL THEN
      SELECT jsonb_build_object('recipient',u.email,'courseId',s.id,'courseTitle',s.title,'cohortName',c.name,'kind',job.kind,'dueAt',job.due_at)
        INTO message FROM auth.users u CROSS JOIN public.studio_courses s CROSS JOIN public.cohorts c WHERE u.id=job.user_id AND s.id=job.course_id AND c.id=job.cohort_id;
    END IF;
    UPDATE public.cohort_reminder_outbox SET status='processing',attempts=attempts+1,lease=gen_random_uuid(),locked_at=clock_timestamp(),first_attempt_at=coalesce(first_attempt_at,clock_timestamp()),payload=message
      WHERE id=job.id RETURNING * INTO job;
    result:=result||jsonb_build_array(jsonb_build_object('id',job.id,'lease',job.lease,'payload',message));
  END LOOP;
  RETURN result;
END;
$$;

CREATE FUNCTION public.authorize_cohort_reminder(_id uuid,_lease uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE job public.cohort_reminder_outbox;
BEGIN
  SELECT * INTO job FROM public.cohort_reminder_outbox WHERE id=_id AND lease=_lease AND status='processing' FOR UPDATE;
  IF NOT FOUND OR job.locked_at<clock_timestamp()-interval '15 minutes' THEN RETURN false; END IF;
  IF NOT public.cohort_reminder_eligible(job) THEN UPDATE public.cohort_reminder_outbox SET status='cancelled',lease=NULL WHERE id=_id; RETURN false; END IF;
  RETURN true;
END;
$$;
CREATE FUNCTION public.finish_cohort_reminder(_id uuid,_lease uuid,_provider_id text,_error text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
  IF _error IS NULL AND (_provider_id IS NULL OR char_length(btrim(_provider_id)) NOT BETWEEN 1 AND 200) THEN RAISE EXCEPTION 'Provider confirmation required'; END IF;
  UPDATE public.cohort_reminder_outbox SET
    status=CASE WHEN _error IS NULL THEN 'sent' WHEN attempts>=8 THEN 'failed' ELSE 'pending' END,
    sent_at=CASE WHEN _error IS NULL THEN clock_timestamp() ELSE NULL END, provider_id=_provider_id,
    last_error=CASE WHEN _error IS NULL THEN NULL ELSE left(_error,100) END,
    not_before=clock_timestamp()+make_interval(mins=>least(120,(power(2,attempts))::integer)),lease=NULL
  WHERE id=_id AND lease=_lease AND status='processing';
  IF NOT FOUND THEN RAISE EXCEPTION 'Reminder lease changed'; END IF;
END;
$$;
REVOKE ALL ON FUNCTION public.enqueue_cohort_reminders(uuid),public.claim_cohort_reminders(integer,uuid),public.authorize_cohort_reminder(uuid,uuid),public.finish_cohort_reminder(uuid,uuid,text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.enqueue_cohort_reminders(uuid),public.claim_cohort_reminders(integer,uuid),public.authorize_cohort_reminder(uuid,uuid),public.finish_cohort_reminder(uuid,uuid,text,text) TO service_role;

CREATE FUNCTION public.cohort_reminder_summary(_cohort uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_role(auth.uid(),'admin') OR NOT EXISTS(SELECT 1 FROM public.cohorts WHERE id=_cohort AND owner_id=auth.uid()) THEN RAISE EXCEPTION 'Only the cohort administrator can view delivery status'; END IF;
  RETURN (SELECT jsonb_build_object('pending',count(*) FILTER(WHERE status IN('pending','processing')),'sent',count(*) FILTER(WHERE status='sent'),'failed',count(*) FILTER(WHERE status='failed'),'cancelled',count(*) FILTER(WHERE status='cancelled')) FROM public.cohort_reminder_outbox WHERE cohort_id=_cohort);
END;
$$;
REVOKE ALL ON FUNCTION public.cohort_reminder_summary(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.cohort_reminder_summary(uuid) TO authenticated;

COMMIT;
