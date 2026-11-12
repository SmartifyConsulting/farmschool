BEGIN;

CREATE TABLE public.course_deadline_extensions (
  course_id uuid NOT NULL REFERENCES public.studio_courses(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  due_at timestamptz,
  reason text NOT NULL,
  changed_by uuid NOT NULL,
  changed_at timestamptz NOT NULL DEFAULT now(),
  version integer NOT NULL DEFAULT 1,
  PRIMARY KEY(course_id,user_id)
);
CREATE TABLE public.course_deadline_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), course_id uuid NOT NULL REFERENCES public.studio_courses(id) ON DELETE CASCADE,
  user_id uuid NOT NULL, due_at timestamptz, reason text NOT NULL, changed_by uuid NOT NULL, changed_at timestamptz NOT NULL DEFAULT now(), version integer NOT NULL
);
ALTER TABLE public.course_deadline_extensions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.course_deadline_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.course_deadline_extensions,public.course_deadline_events FROM anon,authenticated;
GRANT SELECT ON public.course_deadline_extensions,public.course_deadline_events TO authenticated;
CREATE POLICY deadline_extension_read ON public.course_deadline_extensions FOR SELECT TO authenticated USING(user_id=auth.uid() OR EXISTS(SELECT 1 FROM public.studio_courses c WHERE c.id=course_id AND c.author_id=auth.uid()));
CREATE POLICY deadline_events_read ON public.course_deadline_events FOR SELECT TO authenticated USING(user_id=auth.uid() OR EXISTS(SELECT 1 FROM public.studio_courses c WHERE c.id=course_id AND c.author_id=auth.uid()));

CREATE FUNCTION public.effective_course_deadline(_course uuid,_user uuid)
RETURNS timestamptz LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
  WITH base AS (SELECT min(a.due_at) AS due FROM public.cohort_course_assignments a JOIN public.cohort_members m ON m.cohort_id=a.cohort_id WHERE a.course_id=_course AND m.user_id=_user)
  SELECT CASE WHEN base.due IS NULL THEN NULL ELSE greatest(base.due,e.due_at) END FROM base LEFT JOIN public.course_deadline_extensions e ON e.course_id=_course AND e.user_id=_user
$$;
REVOKE ALL ON FUNCTION public.effective_course_deadline(uuid,uuid) FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION public.my_course_submission_deadline(_course uuid)
RETURNS timestamptz LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT public.studio_course_visible(_course) THEN RAISE EXCEPTION 'Course is not available'; END IF;
  RETURN public.effective_course_deadline(_course,auth.uid());
END;
$$;
CREATE FUNCTION public.set_learner_deadline(_course uuid,_learner uuid,_due_at timestamptz,_reason text,_expected_version integer)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE version_now integer; base_due timestamptz;
BEGIN
  PERFORM 1 FROM public.studio_courses WHERE id=_course AND author_id=auth.uid() AND revision_of IS NULL FOR UPDATE;
  IF NOT FOUND OR auth.uid() IS NULL THEN RAISE EXCEPTION 'Only the course owner can extend learner deadlines'; END IF;
  IF _learner IS NULL OR _reason IS NULL OR char_length(btrim(_reason)) NOT BETWEEN 20 AND 2000 THEN RAISE EXCEPTION 'Choose a learner and provide a reason of 20 to 2000 characters'; END IF;
  SELECT min(a.due_at) INTO base_due FROM public.cohort_course_assignments a JOIN public.cohort_members m ON m.cohort_id=a.cohort_id WHERE a.course_id=_course AND m.user_id=_learner;
  IF base_due IS NULL THEN RAISE EXCEPTION 'This learner has no dated cohort assignment'; END IF;
  IF _due_at IS NOT NULL AND _due_at<=base_due THEN RAISE EXCEPTION 'The extension must be later than the cohort deadline'; END IF;
  SELECT version INTO version_now FROM public.course_deadline_extensions WHERE course_id=_course AND user_id=_learner;
  IF _expected_version IS DISTINCT FROM coalesce(version_now,0) THEN RAISE EXCEPTION 'Extension changed. Refresh before saving'; END IF;
  INSERT INTO public.course_deadline_extensions(course_id,user_id,due_at,reason,changed_by)
    VALUES(_course,_learner,_due_at,btrim(_reason),auth.uid())
    ON CONFLICT(course_id,user_id) DO UPDATE SET due_at=excluded.due_at,reason=excluded.reason,changed_by=excluded.changed_by,changed_at=clock_timestamp(),version=public.course_deadline_extensions.version+1
    RETURNING version INTO version_now;
  INSERT INTO public.course_deadline_events(course_id,user_id,due_at,reason,changed_by,version) VALUES(_course,_learner,_due_at,btrim(_reason),auth.uid(),version_now);
  RETURN version_now;
END;
$$;
REVOKE ALL ON FUNCTION public.set_learner_deadline(uuid,uuid,timestamptz,text,integer) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.set_learner_deadline(uuid,uuid,timestamptz,text,integer) TO authenticated;

DO $$
DECLARE definition text; original text:='SELECT min(a.due_at) INTO due FROM public.cohort_course_assignments a JOIN public.cohort_members m ON m.cohort_id=a.cohort_id WHERE a.course_id=course_row.id AND m.user_id=auth.uid();';
BEGIN
  SELECT pg_get_functiondef('public.submit_competency_work(uuid,text,text,integer)'::regprocedure) INTO definition;
  IF strpos(definition,original)=0 THEN RAISE EXCEPTION 'Unexpected submission deadline definition'; END IF;
  EXECUTE replace(definition,original,'due:=public.effective_course_deadline(course_row.id,auth.uid());');
END;
$$;

ALTER TABLE public.cohorts
  ADD COLUMN seat_limit integer CHECK(seat_limit BETWEEN 1 AND 100000),
  ADD COLUMN policy_version integer NOT NULL DEFAULT 0,
  ADD COLUMN auto_enrol_free boolean NOT NULL DEFAULT false,
  ADD COLUMN reminders_enabled boolean NOT NULL DEFAULT false;

CREATE FUNCTION public.cohort_seat_guard()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE seats integer;
BEGIN
  IF TG_TABLE_NAME='cohorts' THEN
    IF NEW.reminders_enabled AND NOT public.has_role(NEW.owner_id,'admin') THEN RAISE EXCEPTION 'Only administrator-owned cohorts can enable email reminders'; END IF;
    IF NEW.seat_limit IS NOT NULL AND (SELECT count(*) FROM public.cohort_members WHERE cohort_id=NEW.id)>NEW.seat_limit THEN RAISE EXCEPTION 'Seat limit is below the current membership'; END IF;
  ELSE
    SELECT seat_limit INTO seats FROM public.cohorts WHERE id=NEW.cohort_id FOR UPDATE;
    IF seats IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.cohort_members WHERE cohort_id=NEW.cohort_id AND user_id=NEW.user_id)
      AND (SELECT count(*) FROM public.cohort_members WHERE cohort_id=NEW.cohort_id)>=seats THEN RAISE EXCEPTION 'This cohort has reached its seat limit'; END IF;
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER cohort_seats_settings BEFORE INSERT OR UPDATE ON public.cohorts FOR EACH ROW EXECUTE FUNCTION public.cohort_seat_guard();
CREATE TRIGGER cohort_seats_members BEFORE INSERT ON public.cohort_members FOR EACH ROW EXECUTE FUNCTION public.cohort_seat_guard();

CREATE FUNCTION public.cohort_auto_enrol(_cohort uuid)
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path='' AS $$
  INSERT INTO public.course_enrollments(user_id,course_id,payment_status,amount_cents)
  SELECT m.user_id,a.course_id,'free',0 FROM public.cohorts c JOIN public.cohort_members m ON m.cohort_id=c.id
    JOIN public.cohort_course_assignments a ON a.cohort_id=c.id JOIN public.studio_courses s ON s.id=a.course_id
  WHERE c.id=_cohort AND c.auto_enrol_free AND s.published AND s.price_cents=0 AND s.revision_of IS NULL
  ON CONFLICT(user_id,course_id) DO NOTHING
$$;
REVOKE ALL ON FUNCTION public.cohort_auto_enrol(uuid) FROM PUBLIC,anon,authenticated;
CREATE FUNCTION public.cohort_auto_enrol_trigger()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
  IF TG_TABLE_NAME='cohorts' THEN PERFORM public.cohort_auto_enrol(NEW.id);
  ELSE PERFORM public.cohort_auto_enrol(NEW.cohort_id); END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER cohort_enrol_policy AFTER UPDATE OF auto_enrol_free ON public.cohorts FOR EACH ROW EXECUTE FUNCTION public.cohort_auto_enrol_trigger();
CREATE TRIGGER cohort_enrol_member AFTER INSERT ON public.cohort_members FOR EACH ROW EXECUTE FUNCTION public.cohort_auto_enrol_trigger();
CREATE TRIGGER cohort_enrol_assignment AFTER INSERT OR UPDATE ON public.cohort_course_assignments FOR EACH ROW EXECUTE FUNCTION public.cohort_auto_enrol_trigger();

CREATE FUNCTION public.save_cohort_policy(_cohort uuid,_seats integer,_auto_free boolean,_reminders boolean,_expected_version integer)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE saved integer;
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_role(auth.uid(),'admin') THEN RAISE EXCEPTION 'Administrator access required'; END IF;
  IF _auto_free IS NULL OR _reminders IS NULL OR (_seats IS NOT NULL AND _seats NOT BETWEEN 1 AND 100000) THEN RAISE EXCEPTION 'Choose a valid cohort policy'; END IF;
  UPDATE public.cohorts SET seat_limit=_seats,auto_enrol_free=_auto_free,reminders_enabled=_reminders,policy_version=policy_version+1
    WHERE id=_cohort AND owner_id=auth.uid() AND policy_version=_expected_version RETURNING policy_version INTO saved;
  IF saved IS NULL THEN RAISE EXCEPTION 'Cohort policy changed or is unavailable. Refresh before saving'; END IF;
  RETURN saved;
END;
$$;
REVOKE ALL ON FUNCTION public.save_cohort_policy(uuid,integer,boolean,boolean,integer) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.save_cohort_policy(uuid,integer,boolean,boolean,integer) TO authenticated;

CREATE TABLE public.cohort_report_managers (
  cohort_id uuid NOT NULL REFERENCES public.cohorts(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  granted_by uuid NOT NULL, granted_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(cohort_id,user_id)
);
ALTER TABLE public.cohort_report_managers ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.cohort_report_managers FROM anon,authenticated;
GRANT SELECT ON public.cohort_report_managers TO authenticated;
CREATE FUNCTION public.cohort_report_access(_cohort uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
  SELECT auth.uid() IS NOT NULL AND (EXISTS(SELECT 1 FROM public.cohorts WHERE id=_cohort AND owner_id=auth.uid() AND public.has_role(auth.uid(),'admin'))
    OR EXISTS(SELECT 1 FROM public.cohort_report_managers WHERE cohort_id=_cohort AND user_id=auth.uid()))
$$;
REVOKE ALL ON FUNCTION public.cohort_report_access(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.cohort_report_access(uuid) TO authenticated;
CREATE POLICY cohort_manager_list ON public.cohorts FOR SELECT TO authenticated USING(public.cohort_report_access(id));
CREATE POLICY cohort_manager_roster ON public.cohort_report_managers FOR SELECT TO authenticated USING(public.cohort_report_access(cohort_id));
CREATE FUNCTION public.my_reporting_cohorts()
RETURNS TABLE(id uuid,name text) LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
  SELECT c.id,c.name FROM public.cohorts c WHERE public.cohort_report_access(c.id) ORDER BY c.name,c.id
$$;
REVOKE ALL ON FUNCTION public.my_reporting_cohorts() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.my_reporting_cohorts() TO authenticated;
CREATE FUNCTION public.set_cohort_report_manager(_cohort uuid,_user uuid,_allow boolean)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
  PERFORM 1 FROM public.cohorts WHERE id=_cohort AND owner_id=auth.uid() FOR UPDATE;
  IF NOT FOUND OR auth.uid() IS NULL OR NOT public.has_role(auth.uid(),'admin') THEN RAISE EXCEPTION 'Only the administrator who owns this cohort can appoint reporting managers'; END IF;
  IF _allow IS NULL OR _user IS NULL THEN RAISE EXCEPTION 'Choose a reporting manager'; END IF;
  IF _allow THEN INSERT INTO public.cohort_report_managers(cohort_id,user_id,granted_by) VALUES(_cohort,_user,auth.uid()) ON CONFLICT DO NOTHING;
  ELSE DELETE FROM public.cohort_report_managers WHERE cohort_id=_cohort AND user_id=_user; END IF;
END;
$$;
REVOKE ALL ON FUNCTION public.set_cohort_report_manager(uuid,uuid,boolean) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.set_cohort_report_manager(uuid,uuid,boolean) TO authenticated;

CREATE FUNCTION public.cohort_progress_report(_cohort uuid,_offset integer DEFAULT 0,_limit integer DEFAULT 50)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE records jsonb; total integer; cohort_name text;
BEGIN
  IF NOT public.cohort_report_access(_cohort) THEN RAISE EXCEPTION 'Cohort reporting access required'; END IF;
  SELECT name INTO cohort_name FROM public.cohorts WHERE id=_cohort;
  IF _offset IS NULL OR _offset<0 OR _limit IS NULL OR _limit NOT BETWEEN 1 AND 200 THEN RAISE EXCEPTION 'Invalid report page'; END IF;
  SELECT count(*) INTO total FROM public.cohort_members m CROSS JOIN public.cohort_course_assignments a WHERE m.cohort_id=_cohort AND a.cohort_id=_cohort;
  SELECT coalesce(jsonb_agg(to_jsonb(page) ORDER BY page.user_id,page.course_id),'[]') INTO records FROM (
    SELECT m.user_id,a.course_id,coalesce(nullif(p.full_name,''),'Learner') AS learner_name,CASE WHEN c.published OR c.author_id=auth.uid() THEN c.title ELSE 'Course unavailable' END AS course_title,
      public.effective_course_deadline(c.id,m.user_id) AS due_at,
      (SELECT count(*) FROM public.studio_lessons l WHERE l.course_id=c.id) AS total_lessons,
      (SELECT count(*) FROM public.lesson_progress lp JOIN public.studio_lessons l ON l.id::text=lp.lesson_id AND l.course_id=c.id WHERE lp.user_id=m.user_id AND lp.course_id=c.id::text AND lp.completed) AS completed_lessons,
      EXISTS(SELECT 1 FROM public.certificates cert WHERE cert.user_id=m.user_id AND cert.source='studio' AND cert.course_ref=c.id::text AND cert.revoked_at IS NULL) AS certified,
      (c.published AND (c.price_cents=0 OR EXISTS(SELECT 1 FROM public.course_enrollments e WHERE e.course_id=c.id AND e.user_id=m.user_id AND (e.payment_status IS NULL OR e.payment_status IN('paid','free'))))) AS payment_access
    FROM public.cohort_members m JOIN public.cohort_course_assignments a ON a.cohort_id=m.cohort_id JOIN public.studio_courses c ON c.id=a.course_id
      LEFT JOIN public.profiles p ON p.user_id=m.user_id
    WHERE m.cohort_id=_cohort ORDER BY m.user_id,a.course_id OFFSET _offset LIMIT _limit
  ) page;
  RETURN jsonb_build_object('name',cohort_name,'total',total,'records',records);
END;
$$;
CREATE FUNCTION public.cohort_progress_export(_cohort uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE report jsonb; records jsonb; page jsonb; next_offset integer:=200;
BEGIN
  report:=public.cohort_progress_report(_cohort,0,200);
  IF (report->>'total')::integer>10000 THEN RAISE EXCEPTION 'This cohort exceeds the export limit. Contact support for a managed export'; END IF;
  records:=report->'records';
  WHILE next_offset<(report->>'total')::integer LOOP
    page:=public.cohort_progress_report(_cohort,next_offset,200); records:=records||(page->'records'); next_offset:=next_offset+200;
  END LOOP;
  IF jsonb_array_length(records)<>(report->>'total')::integer THEN RAISE EXCEPTION 'Incomplete cohort export'; END IF;
  RETURN report||jsonb_build_object('records',records);
END;
$$;
REVOKE ALL ON FUNCTION public.cohort_progress_report(uuid,integer,integer),public.cohort_progress_export(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.cohort_progress_report(uuid,integer,integer),public.cohort_progress_export(uuid) TO authenticated;

COMMIT;
