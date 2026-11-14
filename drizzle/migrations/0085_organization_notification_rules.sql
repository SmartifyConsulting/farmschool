BEGIN;

-- Generalizes the dynamic-rule engine from migration 0069 beyond cohort
-- membership: the same department/job-title/role filter now also drives
-- in-app notifications ("if a person matches X, notify them with Y").
-- cohort_assignment_rules itself is untouched — this is a second, independent
-- instance of the same filter-matching + preview-hash + advisory-lock +
-- audit-log pattern, applied to a different target (notifications instead of
-- cohort membership), proving the model generalizes without touching the
-- proven, already-live cohort automation.
--
-- Scope: one-time-per-match in-app notifications only. Email delivery and
-- other action types (grading overrides, etc.) are not built here.

-- A generic, persisted in-app notification — the primitive this engine
-- writes to. Nothing in the app had a generic notification store before
-- this; everything else derives notifications from other tables on read.
CREATE TABLE public.organization_notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  title text NOT NULL CHECK (char_length(btrim(title)) BETWEEN 1 AND 200),
  body text NOT NULL DEFAULT '' CHECK (char_length(body) <= 4000),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  read_at timestamptz
);
CREATE INDEX organization_notifications_user_idx ON public.organization_notifications(user_id, created_at DESC);

CREATE TABLE public.organization_notification_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  title text NOT NULL CHECK (char_length(btrim(title)) BETWEEN 1 AND 200),
  body text NOT NULL DEFAULT '' CHECK (char_length(body) <= 4000),
  department_id uuid REFERENCES public.organization_departments(id),
  include_descendants boolean NOT NULL DEFAULT true,
  job_contains text CHECK (job_contains IS NULL OR char_length(job_contains) BETWEEN 1 AND 200),
  role_filter text NOT NULL DEFAULT 'learner' CHECK (role_filter IN ('learner', 'manager', 'all')),
  enabled boolean NOT NULL DEFAULT false,
  interval_minutes integer NOT NULL DEFAULT 60 CHECK (interval_minutes BETWEEN 15 AND 10080),
  version integer NOT NULL DEFAULT 1,
  changed_by uuid NOT NULL,
  next_run timestamptz NOT NULL DEFAULT clock_timestamp(),
  last_run timestamptz,
  last_status text,
  last_sent integer NOT NULL DEFAULT 0
);

-- Who has already been notified by a given rule — a match only ever
-- produces one notification per person per rule (V1 simplification: if
-- someone leaves and re-enters the matching set later, they are not
-- notified again by the same rule).
CREATE TABLE public.organization_notification_rule_sent (
  rule_id uuid NOT NULL REFERENCES public.organization_notification_rules(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  sent_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (rule_id, user_id)
);

CREATE TABLE public.organization_notification_rule_runs (
  request_id uuid PRIMARY KEY,
  rule_id uuid NOT NULL REFERENCES public.organization_notification_rules(id),
  actor_id uuid,
  preview_hash text,
  result jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);

ALTER TABLE public.organization_notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.organization_notification_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.organization_notification_rule_sent ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.organization_notification_rule_runs ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.organization_notifications, public.organization_notification_rules,
  public.organization_notification_rule_sent, public.organization_notification_rule_runs
  FROM PUBLIC, anon, authenticated;
GRANT SELECT, UPDATE ON public.organization_notifications TO authenticated;
GRANT SELECT ON public.organization_notification_rules TO authenticated;
GRANT ALL ON public.organization_notifications, public.organization_notification_rules,
  public.organization_notification_rule_sent, public.organization_notification_rule_runs TO service_role;

CREATE POLICY organization_notifications_own_read ON public.organization_notifications
  FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY organization_notifications_own_mark_read ON public.organization_notifications
  FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY organization_notification_rules_manager_read ON public.organization_notification_rules
  FOR SELECT TO authenticated USING (public.organization_manage(organization_id));

CREATE FUNCTION public.save_organization_notification_rule(
  _id uuid, _organization uuid, _title text, _body text, _department uuid, _descendants boolean,
  _job text, _role text, _interval integer, _expected integer
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE existing public.organization_notification_rules; result uuid;
BEGIN
  IF NOT public.organization_manage(_organization) THEN
    RAISE EXCEPTION 'Only an organization manager can manage notification rules.';
  END IF;
  IF _title IS NULL OR char_length(btrim(_title)) < 1 OR _role IS NULL OR _role NOT IN ('learner', 'manager', 'all')
    OR _interval IS NULL OR _interval NOT BETWEEN 15 AND 10080
    OR (_job IS NOT NULL AND char_length(_job) > 200)
    OR (_department IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.organization_departments WHERE id = _department AND organization_id = _organization))
  THEN
    RAISE EXCEPTION 'Choose a title, valid criteria, and a schedule of at least 15 minutes.';
  END IF;
  IF _id IS NULL THEN
    INSERT INTO public.organization_notification_rules (
      organization_id, title, body, department_id, include_descendants, job_contains, role_filter, interval_minutes, changed_by
    ) VALUES (
      _organization, btrim(_title), coalesce(_body, ''), _department, coalesce(_descendants, true),
      nullif(btrim(_job), ''), _role, _interval, auth.uid()
    ) RETURNING id INTO result;
  ELSE
    SELECT * INTO existing FROM public.organization_notification_rules WHERE id = _id AND organization_id = _organization FOR UPDATE;
    IF NOT FOUND OR existing.version IS DISTINCT FROM _expected THEN
      RAISE EXCEPTION 'This rule changed. Refresh before saving.';
    END IF;
    UPDATE public.organization_notification_rules SET
      title = btrim(_title), body = coalesce(_body, ''), department_id = _department,
      include_descendants = coalesce(_descendants, true), job_contains = nullif(btrim(_job), ''),
      role_filter = _role, interval_minutes = _interval, changed_by = auth.uid(), version = version + 1
    WHERE id = _id RETURNING id INTO result;
  END IF;
  INSERT INTO public.audit_events(actor_id, action, entity_type, entity_id, metadata)
    VALUES (auth.uid(), 'organization.notification_rule_saved', 'organization', _organization::text, jsonb_build_object('rule_id', result));
  RETURN result;
END;
$$;
REVOKE ALL ON FUNCTION public.save_organization_notification_rule(
  uuid, uuid, text, text, uuid, boolean, text, text, integer, integer
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_organization_notification_rule(
  uuid, uuid, text, text, uuid, boolean, text, text, integer, integer
) TO authenticated;

CREATE FUNCTION public.organization_notification_rule_plan(_rule uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH RECURSIVE rule AS (SELECT * FROM public.organization_notification_rules WHERE id = _rule),
  departments AS (
    SELECT d.id FROM public.organization_departments d, rule r WHERE d.id = r.department_id AND d.organization_id = r.organization_id
    UNION
    SELECT d.id FROM public.organization_departments d JOIN departments parent ON d.parent_id = parent.id JOIN rule r ON d.organization_id = r.organization_id AND r.include_descendants
  ),
  matching AS (
    SELECT m.user_id FROM public.organization_members m JOIN rule r ON r.organization_id = m.organization_id
    WHERE (r.role_filter = 'all' OR m.role = r.role_filter)
      AND (r.department_id IS NULL OR m.department_id IN (SELECT id FROM departments))
      AND (r.job_contains IS NULL OR position(lower(r.job_contains) IN lower(m.job_title)) > 0)
      AND NOT EXISTS (SELECT 1 FROM public.organization_notification_rule_sent s WHERE s.rule_id = r.id AND s.user_id = m.user_id)
  )
  SELECT jsonb_build_object(
    'rule_id', r.id, 'version', r.version,
    'notify', coalesce((SELECT jsonb_agg(user_id ORDER BY user_id) FROM matching), '[]'::jsonb),
    'matching', (SELECT count(*) FROM matching)
  ) FROM rule r
$$;
REVOKE ALL ON FUNCTION public.organization_notification_rule_plan(uuid) FROM PUBLIC, anon, authenticated;

CREATE FUNCTION public.preview_organization_notification_rule(_rule uuid, _expected integer)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE rule_row public.organization_notification_rules; plan jsonb;
BEGIN
  SELECT * INTO rule_row FROM public.organization_notification_rules WHERE id = _rule;
  IF NOT FOUND OR NOT public.organization_manage(rule_row.organization_id) OR rule_row.version IS DISTINCT FROM _expected THEN
    RAISE EXCEPTION 'Save this rule and refresh before previewing.';
  END IF;
  plan := public.organization_notification_rule_plan(_rule);
  RETURN jsonb_build_object(
    'hash', encode(sha256(convert_to(plan::text, 'UTF8')), 'hex'),
    'notify', jsonb_array_length(plan->'notify'),
    'examples', coalesce((
      SELECT jsonb_agg(coalesce(nullif(p.full_name, ''), 'Learner') ORDER BY p.full_name)
      FROM (SELECT value::uuid AS user_id FROM jsonb_array_elements_text(plan->'notify') LIMIT 20) item
      LEFT JOIN public.profiles p ON p.user_id = item.user_id
    ), '[]'::jsonb)
  );
END;
$$;
REVOKE ALL ON FUNCTION public.preview_organization_notification_rule(uuid, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.preview_organization_notification_rule(uuid, integer) TO authenticated;

CREATE FUNCTION public.apply_organization_notification_rule(
  _rule uuid, _hash text, _request uuid, _scheduled boolean
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE rule_row public.organization_notification_rules; plan jsonb; digest text; saved public.organization_notification_rule_runs;
  person uuid; sent integer := 0; result jsonb;
BEGIN
  IF _request IS NULL THEN RAISE EXCEPTION 'Rule execution request required.'; END IF;
  IF NOT pg_try_advisory_xact_lock(hashtextextended('org-notify-rule:' || _rule, 0)) THEN
    RETURN jsonb_build_object('status', 'busy', 'sent', 0);
  END IF;
  SELECT * INTO rule_row FROM public.organization_notification_rules WHERE id = _rule FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('status', 'not_found', 'sent', 0); END IF;
  IF NOT _scheduled AND NOT public.organization_manage(rule_row.organization_id) THEN
    RAISE EXCEPTION 'Only an organization manager can run this rule.';
  END IF;
  SELECT * INTO saved FROM public.organization_notification_rule_runs WHERE request_id = _request;
  IF FOUND THEN RETURN saved.result; END IF;
  IF _scheduled AND (NOT rule_row.enabled OR rule_row.next_run > clock_timestamp()) THEN
    RETURN jsonb_build_object('status', 'not_due', 'sent', 0);
  END IF;
  plan := public.organization_notification_rule_plan(_rule);
  digest := encode(sha256(convert_to(plan::text, 'UTF8')), 'hex');
  IF NOT _scheduled AND (_hash IS NULL OR digest <> _hash) THEN
    RAISE EXCEPTION 'The matching list changed. Preview again before sending.';
  END IF;
  FOR person IN SELECT value::uuid FROM jsonb_array_elements_text(plan->'notify') LOOP
    INSERT INTO public.organization_notifications(organization_id, user_id, title, body)
      VALUES (rule_row.organization_id, person, rule_row.title, rule_row.body);
    INSERT INTO public.organization_notification_rule_sent(rule_id, user_id) VALUES (_rule, person) ON CONFLICT DO NOTHING;
    sent := sent + 1;
  END LOOP;
  UPDATE public.organization_notification_rules SET
    last_run = clock_timestamp(), last_status = 'applied', last_sent = sent,
    next_run = clock_timestamp() + make_interval(mins => interval_minutes)
  WHERE id = _rule;
  result := jsonb_build_object('status', 'applied', 'sent', sent, 'scheduled', _scheduled);
  INSERT INTO public.organization_notification_rule_runs(request_id, rule_id, actor_id, preview_hash, result)
    VALUES (_request, _rule, CASE WHEN _scheduled THEN NULL ELSE auth.uid() END, _hash, result);
  INSERT INTO public.audit_events(actor_id, action, entity_type, entity_id, metadata)
    VALUES (CASE WHEN _scheduled THEN NULL ELSE auth.uid() END, 'organization.notification_rule_applied', 'organization', rule_row.organization_id::text, jsonb_build_object('rule_id', _rule, 'sent', sent));
  RETURN result;
END;
$$;
REVOKE ALL ON FUNCTION public.apply_organization_notification_rule(uuid, text, uuid, boolean) FROM PUBLIC, anon, authenticated;

CREATE FUNCTION public.run_organization_notification_rule(_rule uuid, _hash text, _request uuid)
RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT public.apply_organization_notification_rule(_rule, _hash, _request, false)
$$;
REVOKE ALL ON FUNCTION public.run_organization_notification_rule(uuid, text, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.run_organization_notification_rule(uuid, text, uuid) TO authenticated;

CREATE FUNCTION public.set_organization_notification_rule_schedule(_rule uuid, _expected integer, _enabled boolean)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE saved public.organization_notification_rules; result integer;
BEGIN
  SELECT * INTO saved FROM public.organization_notification_rules WHERE id = _rule FOR UPDATE;
  IF NOT FOUND OR NOT public.organization_manage(saved.organization_id) OR _enabled IS NULL OR saved.version IS DISTINCT FROM _expected THEN
    RAISE EXCEPTION 'This rule changed. Refresh before changing its schedule.';
  END IF;
  UPDATE public.organization_notification_rules SET enabled = _enabled, version = version + 1, changed_by = auth.uid(),
    next_run = clock_timestamp() + make_interval(mins => interval_minutes) WHERE id = _rule RETURNING version INTO result;
  RETURN result;
END;
$$;
REVOKE ALL ON FUNCTION public.set_organization_notification_rule_schedule(uuid, integer, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_organization_notification_rule_schedule(uuid, integer, boolean) TO authenticated;

-- Cron entry point, parallel to run_due_organization_assignment_rules.
CREATE FUNCTION public.run_due_organization_notification_rules(_limit integer DEFAULT 10)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE item record; result jsonb; applied integer := 0; failed integer := 0; skipped integer := 0;
BEGIN
  IF _limit IS NULL OR _limit NOT BETWEEN 1 AND 20 THEN RAISE EXCEPTION 'Choose a supported rule batch size.'; END IF;
  FOR item IN
    SELECT id FROM public.organization_notification_rules
    WHERE enabled AND next_run <= clock_timestamp() ORDER BY next_run, id LIMIT _limit
  LOOP
    BEGIN
      result := public.apply_organization_notification_rule(item.id, NULL, gen_random_uuid(), true);
      IF result->>'status' = 'applied' THEN applied := applied + 1; ELSE skipped := skipped + 1; END IF;
    EXCEPTION WHEN OTHERS THEN
      UPDATE public.organization_notification_rules SET last_run = clock_timestamp(), last_status = 'rule_failed',
        next_run = clock_timestamp() + make_interval(mins => interval_minutes) WHERE id = item.id;
      failed := failed + 1;
    END;
  END LOOP;
  RETURN jsonb_build_object('applied', applied, 'failed', failed, 'skipped', skipped);
END;
$$;
REVOKE ALL ON FUNCTION public.run_due_organization_notification_rules(integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.run_due_organization_notification_rules(integer) TO service_role;

CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA pg_catalog;
SELECT cron.schedule('plusticity-organization-notification-rules', '*/15 * * * *',
  $job$SET statement_timeout='45s'; SELECT public.run_due_organization_notification_rules(10);$job$);

CREATE FUNCTION public.my_organization_notifications()
RETURNS TABLE(id uuid, organization_name text, title text, body text, created_at timestamptz, read_at timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT n.id, o.name, n.title, n.body, n.created_at, n.read_at
  FROM public.organization_notifications n JOIN public.organizations o ON o.id = n.organization_id
  WHERE n.user_id = auth.uid() ORDER BY n.created_at DESC LIMIT 200
$$;
REVOKE ALL ON FUNCTION public.my_organization_notifications() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.my_organization_notifications() TO authenticated;

CREATE FUNCTION public.organization_notification_rule_history(_rule uuid)
RETURNS TABLE(request_id uuid, created_at timestamptz, actor_name text, result jsonb)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT run.request_id, run.created_at,
    CASE WHEN run.actor_id IS NULL THEN 'Scheduled automation' ELSE coalesce(nullif(p.full_name, ''), 'Workspace manager') END,
    run.result
  FROM public.organization_notification_rule_runs run
  JOIN public.organization_notification_rules r ON r.id = run.rule_id
  LEFT JOIN public.profiles p ON p.user_id = run.actor_id
  WHERE r.id = _rule AND public.organization_manage(r.organization_id)
  ORDER BY run.created_at DESC
$$;
REVOKE ALL ON FUNCTION public.organization_notification_rule_history(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.organization_notification_rule_history(uuid) TO authenticated;

COMMIT;
