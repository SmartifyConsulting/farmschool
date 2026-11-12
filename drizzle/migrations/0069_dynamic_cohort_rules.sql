BEGIN;
CREATE TABLE public.cohort_assignment_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), cohort_id uuid NOT NULL UNIQUE REFERENCES public.organization_cohorts(cohort_id) ON DELETE CASCADE,
  department_id uuid REFERENCES public.organization_departments(id), include_descendants boolean NOT NULL DEFAULT true,
  job_contains text CHECK(job_contains IS NULL OR char_length(job_contains) BETWEEN 1 AND 200), role_filter text NOT NULL DEFAULT 'learner' CHECK(role_filter IN('learner','manager','all')),
  add_only boolean NOT NULL DEFAULT true, enabled boolean NOT NULL DEFAULT false, interval_minutes integer NOT NULL DEFAULT 60 CHECK(interval_minutes BETWEEN 15 AND 10080),
  version integer NOT NULL DEFAULT 1, changed_by uuid NOT NULL, next_run timestamptz NOT NULL DEFAULT clock_timestamp(), last_run timestamptz,
  last_status text, last_run_version integer, last_added integer NOT NULL DEFAULT 0, last_removed integer NOT NULL DEFAULT 0
);
CREATE TABLE public.cohort_rule_members (
  rule_id uuid NOT NULL REFERENCES public.cohort_assignment_rules(id) ON DELETE CASCADE, cohort_id uuid NOT NULL, user_id uuid NOT NULL,
  PRIMARY KEY(rule_id,user_id), FOREIGN KEY(cohort_id,user_id) REFERENCES public.cohort_members(cohort_id,user_id) ON DELETE CASCADE
);
CREATE TABLE public.cohort_rule_exclusions (
  rule_id uuid NOT NULL REFERENCES public.cohort_assignment_rules(id) ON DELETE CASCADE, user_id uuid NOT NULL, excluded_by uuid, excluded_at timestamptz NOT NULL DEFAULT clock_timestamp(), PRIMARY KEY(rule_id,user_id)
);
CREATE TABLE public.cohort_rule_operation_markers ( transaction_id bigint NOT NULL, rule_id uuid NOT NULL REFERENCES public.cohort_assignment_rules(id) ON DELETE CASCADE, PRIMARY KEY(transaction_id,rule_id) );
CREATE TABLE public.cohort_rule_runs (
  request_id uuid PRIMARY KEY, rule_id uuid NOT NULL REFERENCES public.cohort_assignment_rules(id), actor_id uuid, preview_hash text, result jsonb NOT NULL, changes jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE TABLE public.organization_automation_health ( id boolean PRIMARY KEY DEFAULT true CHECK(id), last_run timestamptz NOT NULL );
ALTER TABLE public.cohort_assignment_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cohort_rule_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cohort_rule_exclusions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cohort_rule_operation_markers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cohort_rule_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.organization_automation_health ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.cohort_assignment_rules,public.cohort_rule_members,public.cohort_rule_exclusions,public.cohort_rule_operation_markers,public.cohort_rule_runs,public.organization_automation_health FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.cohort_assignment_rules,public.cohort_rule_exclusions TO authenticated;
GRANT ALL ON public.cohort_assignment_rules,public.cohort_rule_members,public.cohort_rule_exclusions,public.cohort_rule_operation_markers,public.cohort_rule_runs,public.organization_automation_health TO service_role;
CREATE POLICY cohort_rules_manager_read ON public.cohort_assignment_rules FOR SELECT TO authenticated USING(EXISTS(SELECT 1 FROM public.organization_cohorts oc WHERE oc.cohort_id=cohort_assignment_rules.cohort_id AND public.organization_manage(oc.organization_id)));
CREATE POLICY cohort_rule_exclusions_read ON public.cohort_rule_exclusions FOR SELECT TO authenticated USING(EXISTS(SELECT 1 FROM public.cohort_assignment_rules r WHERE r.id=rule_id));

CREATE FUNCTION public.cohort_rule_manual_membership()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE rule_ref uuid; cohort_ref uuid; person uuid;
BEGIN
  cohort_ref:=CASE WHEN TG_OP='DELETE' THEN OLD.cohort_id ELSE NEW.cohort_id END;
  person:=CASE WHEN TG_OP='DELETE' THEN OLD.user_id ELSE NEW.user_id END;
  SELECT id INTO rule_ref FROM public.cohort_assignment_rules WHERE cohort_id=cohort_ref;
  IF rule_ref IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.cohort_rule_operation_markers WHERE transaction_id=txid_current() AND rule_id=rule_ref) THEN
    IF TG_OP='DELETE' THEN INSERT INTO public.cohort_rule_exclusions(rule_id,user_id,excluded_by) VALUES(rule_ref,person,auth.uid()) ON CONFLICT DO NOTHING;
    ELSE DELETE FROM public.cohort_rule_exclusions WHERE rule_id=rule_ref AND user_id=person;
      DELETE FROM public.cohort_rule_members WHERE rule_id=rule_ref AND user_id=person;
    END IF;
  END IF;
  IF TG_OP='DELETE' THEN RETURN OLD; END IF; RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.cohort_rule_manual_membership() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER zz_cohort_rule_manual_edits BEFORE INSERT OR DELETE ON public.cohort_members FOR EACH ROW EXECUTE FUNCTION public.cohort_rule_manual_membership();

CREATE FUNCTION public.save_cohort_assignment_rule(_cohort uuid,_department uuid,_descendants boolean,_job text,_role text,_add_only boolean,_enabled boolean,_interval integer,_expected integer)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE org_ref uuid; existing public.cohort_assignment_rules; result integer;
BEGIN
  org_ref:=public.organization_cohort_manage(_cohort);
  IF _enabled THEN RAISE EXCEPTION 'Save the rule paused, preview its roster, then enable scheduling'; END IF;
  IF _descendants IS NULL OR _add_only IS NULL OR _enabled IS NULL OR _role IS NULL OR _role NOT IN('learner','manager','all') OR _interval IS NULL OR _interval NOT BETWEEN 15 AND 10080
    OR (_job IS NOT NULL AND char_length(_job)>200) OR (_department IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.organization_departments WHERE id=_department AND organization_id=org_ref)) THEN RAISE EXCEPTION 'Choose valid organization rule criteria and a schedule of at least 15 minutes'; END IF;
  SELECT * INTO existing FROM public.cohort_assignment_rules WHERE cohort_id=_cohort FOR UPDATE;
  IF coalesce(existing.version,0) IS DISTINCT FROM _expected THEN RAISE EXCEPTION 'Assignment rule changed. Refresh before saving'; END IF;
  INSERT INTO public.cohort_assignment_rules(cohort_id,department_id,include_descendants,job_contains,role_filter,add_only,enabled,interval_minutes,changed_by)
    VALUES(_cohort,_department,_descendants,nullif(btrim(_job),''),_role,_add_only,_enabled,_interval,auth.uid())
    ON CONFLICT(cohort_id) DO UPDATE SET department_id=excluded.department_id,include_descendants=excluded.include_descendants,job_contains=excluded.job_contains,role_filter=excluded.role_filter,
      add_only=excluded.add_only,enabled=excluded.enabled,interval_minutes=excluded.interval_minutes,changed_by=auth.uid(),version=cohort_assignment_rules.version+1,next_run=clock_timestamp()+make_interval(mins=>_interval) RETURNING version INTO result;
  INSERT INTO public.audit_events(actor_id,action,entity_type,entity_id,metadata) VALUES(auth.uid(),'cohort.assignment_rule_saved','cohort',_cohort::text,jsonb_build_object('version',result,'enabled',_enabled,'add_only',_add_only));
  RETURN result;
END;
$$;

CREATE FUNCTION public.cohort_assignment_rule_plan(_rule uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
  WITH RECURSIVE rule AS (SELECT r.*,oc.organization_id FROM public.cohort_assignment_rules r JOIN public.organization_cohorts oc ON oc.cohort_id=r.cohort_id WHERE r.id=_rule),
  departments AS (SELECT d.id FROM public.organization_departments d,rule r WHERE d.id=r.department_id AND d.organization_id=r.organization_id
    UNION SELECT d.id FROM public.organization_departments d JOIN departments parent ON d.parent_id=parent.id JOIN rule r ON d.organization_id=r.organization_id AND r.include_descendants),
  matching AS (SELECT m.user_id FROM public.organization_members m JOIN rule r ON r.organization_id=m.organization_id
    WHERE (r.role_filter='all' OR m.role=r.role_filter) AND (r.department_id IS NULL OR m.department_id IN(SELECT id FROM departments))
      AND (r.job_contains IS NULL OR position(lower(r.job_contains) IN lower(m.job_title))>0)
      AND NOT EXISTS(SELECT 1 FROM public.cohort_rule_exclusions e WHERE e.rule_id=r.id AND e.user_id=m.user_id)),
  additions AS (SELECT m.user_id FROM matching m,rule r WHERE NOT EXISTS(SELECT 1 FROM public.cohort_members cm WHERE cm.cohort_id=r.cohort_id AND cm.user_id=m.user_id)),
  removals AS (SELECT rm.user_id FROM public.cohort_rule_members rm JOIN rule r ON r.id=rm.rule_id WHERE NOT r.add_only AND NOT EXISTS(SELECT 1 FROM matching m WHERE m.user_id=rm.user_id))
  SELECT jsonb_build_object('rule_id',r.id,'version',r.version,'cohort_id',r.cohort_id,
    'add',coalesce((SELECT jsonb_agg(user_id ORDER BY user_id) FROM additions),'[]'::jsonb),'remove',coalesce((SELECT jsonb_agg(user_id ORDER BY user_id) FROM removals),'[]'::jsonb),
    'matching',(SELECT count(*) FROM matching),'current',(SELECT count(*) FROM public.cohort_members WHERE cohort_id=r.cohort_id),
    'excluded',(SELECT count(*) FROM public.cohort_rule_exclusions WHERE rule_id=r.id),'seat_limit',c.seat_limit) FROM rule r JOIN public.cohorts c ON c.id=r.cohort_id
$$;
REVOKE ALL ON FUNCTION public.cohort_assignment_rule_plan(uuid) FROM PUBLIC,anon,authenticated;
CREATE FUNCTION public.preview_cohort_assignment_rule(_cohort uuid,_expected integer)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE rule_ref uuid; rule_version integer; plan jsonb; added integer; removed integer;
BEGIN
  PERFORM public.organization_cohort_manage(_cohort);
  SELECT id,version INTO rule_ref,rule_version FROM public.cohort_assignment_rules WHERE cohort_id=_cohort;
  IF rule_ref IS NULL OR rule_version IS DISTINCT FROM _expected THEN RAISE EXCEPTION 'Save the rule and refresh before previewing'; END IF;
  plan:=public.cohort_assignment_rule_plan(rule_ref); added:=jsonb_array_length(plan->'add'); removed:=jsonb_array_length(plan->'remove');
  RETURN jsonb_build_object('hash',encode(sha256(convert_to(plan::text,'UTF8')),'hex'),'add',added,'remove',removed,'matching',plan->'matching','current',plan->'current','excluded',plan->'excluded','seat_limit',plan->'seat_limit',
    'capacity_ok',(plan->>'seat_limit') IS NULL OR (plan->>'current')::integer-removed+added<=(plan->>'seat_limit')::integer,
    'examples',coalesce((SELECT jsonb_agg(jsonb_build_object('name',coalesce(nullif(p.full_name,''),'Learner'),'action',item.action) ORDER BY item.action,item.person) FROM (
      SELECT person,'Add' AS action FROM jsonb_array_elements_text(plan->'add') person UNION ALL SELECT person,'Remove' FROM jsonb_array_elements_text(plan->'remove') person ORDER BY action,person LIMIT 20
    ) item LEFT JOIN public.profiles p ON p.user_id=item.person::uuid),'[]'::jsonb));
END;
$$;
CREATE FUNCTION public.apply_cohort_assignment_rule(_rule uuid,_expected integer,_hash text,_request uuid,_scheduled boolean)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE rule_row public.cohort_assignment_rules; org_ref uuid; plan jsonb; digest text; saved public.cohort_rule_runs; person uuid; inserted integer; added integer:=0; removed integer:=0; result jsonb; added_people jsonb:='[]'; removed_people jsonb;
BEGIN
  IF _request IS NULL THEN RAISE EXCEPTION 'Rule execution request required'; END IF;
  IF NOT pg_try_advisory_xact_lock(hashtextextended('cohort-rule:'||_rule,0)) THEN RETURN jsonb_build_object('status','busy','added',0,'removed',0); END IF;
  SELECT oc.organization_id INTO org_ref FROM public.cohort_assignment_rules r JOIN public.organization_cohorts oc ON oc.cohort_id=r.cohort_id WHERE r.id=_rule;
  IF org_ref IS NULL THEN RETURN jsonb_build_object('status','not_found','added',0,'removed',0); END IF;
  PERFORM 1 FROM public.organizations WHERE id=org_ref FOR UPDATE;
  SELECT * INTO rule_row FROM public.cohort_assignment_rules WHERE id=_rule;
  PERFORM 1 FROM public.cohorts WHERE id=rule_row.cohort_id FOR UPDATE;
  SELECT * INTO rule_row FROM public.cohort_assignment_rules WHERE id=_rule FOR UPDATE;
  SELECT * INTO saved FROM public.cohort_rule_runs WHERE request_id=_request;
  IF FOUND THEN
    IF saved.rule_id<>_rule OR saved.preview_hash IS DISTINCT FROM _hash OR saved.actor_id IS DISTINCT FROM (CASE WHEN _scheduled THEN NULL ELSE auth.uid() END) THEN RAISE EXCEPTION 'Execution request changed. Preview again'; END IF;
    RETURN saved.result;
  END IF;
  IF _scheduled AND (NOT rule_row.enabled OR rule_row.next_run>clock_timestamp()) THEN RETURN jsonb_build_object('status','not_due','added',0,'removed',0); END IF;
  IF NOT _scheduled AND rule_row.version IS DISTINCT FROM _expected THEN RAISE EXCEPTION 'Assignment rule changed. Preview again'; END IF;
  plan:=public.cohort_assignment_rule_plan(_rule); digest:=encode(sha256(convert_to(plan::text,'UTF8')),'hex');
  IF NOT _scheduled AND (_hash IS NULL OR digest<>_hash) THEN RAISE EXCEPTION 'The matching roster changed. Preview again before applying'; END IF;
  IF (plan->>'seat_limit') IS NOT NULL AND (plan->>'current')::integer-jsonb_array_length(plan->'remove')+jsonb_array_length(plan->'add')>(plan->>'seat_limit')::integer THEN RAISE EXCEPTION 'Cohort capacity is too small for this rule. Increase the limit or narrow the criteria'; END IF;
  INSERT INTO public.cohort_rule_operation_markers(transaction_id,rule_id) VALUES(txid_current(),_rule);
  WITH gone AS (DELETE FROM public.cohort_members m USING public.cohort_rule_members rm WHERE rm.rule_id=_rule AND rm.cohort_id=m.cohort_id AND rm.user_id=m.user_id AND m.user_id IN(SELECT value::uuid FROM jsonb_array_elements_text(plan->'remove')) RETURNING m.user_id)
    SELECT coalesce(jsonb_agg(user_id ORDER BY user_id),'[]'::jsonb) INTO removed_people FROM gone;
  removed:=jsonb_array_length(removed_people);
  FOR person IN SELECT value::uuid FROM jsonb_array_elements_text(plan->'add') LOOP
    INSERT INTO public.cohort_members(cohort_id,user_id) VALUES(rule_row.cohort_id,person) ON CONFLICT DO NOTHING;
    GET DIAGNOSTICS inserted=ROW_COUNT;
    IF inserted=1 THEN INSERT INTO public.cohort_rule_members(rule_id,cohort_id,user_id) VALUES(_rule,rule_row.cohort_id,person); added:=added+1; added_people:=added_people||jsonb_build_array(person); END IF;
  END LOOP;
  DELETE FROM public.cohort_rule_operation_markers WHERE transaction_id=txid_current() AND rule_id=_rule;
  UPDATE public.cohort_assignment_rules SET last_run=clock_timestamp(),last_status='applied',last_run_version=rule_row.version,last_added=added,last_removed=removed,next_run=clock_timestamp()+make_interval(mins=>interval_minutes) WHERE id=_rule;
  result:=jsonb_build_object('status','applied','added',added,'removed',removed,'version',rule_row.version,'scheduled',_scheduled);
  INSERT INTO public.cohort_rule_runs(request_id,rule_id,actor_id,preview_hash,result,changes) VALUES(_request,_rule,CASE WHEN _scheduled THEN NULL ELSE auth.uid() END,_hash,result,jsonb_build_object('added',added_people,'removed',removed_people));
  INSERT INTO public.audit_events(actor_id,action,entity_type,entity_id,metadata) VALUES(CASE WHEN _scheduled THEN NULL ELSE auth.uid() END,'cohort.assignment_rule_applied','cohort',rule_row.cohort_id::text,jsonb_build_object('rule_id',_rule,'version',rule_row.version,'scheduled',_scheduled,'added',added,'removed',removed));
  RETURN result;
END;
$$;
REVOKE ALL ON FUNCTION public.apply_cohort_assignment_rule(uuid,integer,text,uuid,boolean) FROM PUBLIC,anon,authenticated;
CREATE FUNCTION public.run_cohort_assignment_rule(_cohort uuid,_expected integer,_hash text,_request uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE rule_ref uuid;
BEGIN
  PERFORM public.organization_cohort_manage(_cohort);
  SELECT id INTO rule_ref FROM public.cohort_assignment_rules WHERE cohort_id=_cohort;
  IF rule_ref IS NULL THEN RAISE EXCEPTION 'Save and preview a rule first'; END IF;
  RETURN public.apply_cohort_assignment_rule(rule_ref,_expected,_hash,_request,false);
END;
$$;
CREATE FUNCTION public.allow_cohort_rule_member(_cohort uuid,_user uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
  PERFORM public.organization_cohort_manage(_cohort);
  DELETE FROM public.cohort_rule_exclusions e USING public.cohort_assignment_rules r WHERE e.rule_id=r.id AND r.cohort_id=_cohort AND e.user_id=_user;
  INSERT INTO public.audit_events(actor_id,action,entity_type,entity_id,metadata) VALUES(auth.uid(),'cohort.assignment_exclusion_cleared','cohort',_cohort::text,jsonb_build_object('user_id',_user));
END;
$$;
CREATE FUNCTION public.run_due_organization_assignment_rules(_organization uuid DEFAULT NULL,_limit integer DEFAULT 10)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE item record; result jsonb; applied integer:=0; failed integer:=0; skipped integer:=0; failure text;
BEGIN
  IF _limit IS NULL OR _limit NOT BETWEEN 1 AND 20 THEN RAISE EXCEPTION 'Choose a supported rule batch size'; END IF;
  FOR item IN SELECT r.id FROM public.cohort_assignment_rules r JOIN public.organization_cohorts oc ON oc.cohort_id=r.cohort_id WHERE r.enabled AND r.next_run<=clock_timestamp() AND (_organization IS NULL OR oc.organization_id=_organization) ORDER BY r.next_run,r.id LIMIT _limit LOOP
    BEGIN
      result:=public.apply_cohort_assignment_rule(item.id,NULL,NULL,gen_random_uuid(),true);
      IF result->>'status'='applied' THEN applied:=applied+1; ELSE skipped:=skipped+1; END IF;
    EXCEPTION WHEN OTHERS THEN
      failure:=CASE WHEN SQLERRM LIKE 'Cohort capacity%' THEN 'capacity_exceeded' ELSE 'rule_failed' END;
      UPDATE public.cohort_assignment_rules SET last_run=clock_timestamp(),last_status=failure,last_run_version=NULL,last_added=0,last_removed=0,next_run=clock_timestamp()+make_interval(mins=>interval_minutes) WHERE id=item.id; failed:=failed+1;
    END;
  END LOOP;
  INSERT INTO public.organization_automation_health(id,last_run) VALUES(true,clock_timestamp()) ON CONFLICT(id) DO UPDATE SET last_run=excluded.last_run;
  RETURN jsonb_build_object('applied',applied,'failed',failed,'skipped',skipped);
END;
$$;
REVOKE ALL ON FUNCTION public.run_due_organization_assignment_rules(uuid,integer) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.run_due_organization_assignment_rules(uuid,integer) TO service_role;
REVOKE ALL ON FUNCTION public.save_cohort_assignment_rule(uuid,uuid,boolean,text,text,boolean,boolean,integer,integer),public.preview_cohort_assignment_rule(uuid,integer),public.run_cohort_assignment_rule(uuid,integer,text,uuid),public.allow_cohort_rule_member(uuid,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.save_cohort_assignment_rule(uuid,uuid,boolean,text,text,boolean,boolean,integer,integer),public.preview_cohort_assignment_rule(uuid,integer),public.run_cohort_assignment_rule(uuid,integer,text,uuid),public.allow_cohort_rule_member(uuid,uuid) TO authenticated;
CREATE FUNCTION public.cohort_rule_excluded_people(_cohort uuid)
RETURNS TABLE(user_id uuid,full_name text,excluded_at timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
  SELECT e.user_id,coalesce(nullif(p.full_name,''),'Former or current learner'),e.excluded_at FROM public.cohort_rule_exclusions e
  JOIN public.cohort_assignment_rules r ON r.id=e.rule_id JOIN public.organization_cohorts oc ON oc.cohort_id=r.cohort_id LEFT JOIN public.profiles p ON p.user_id=e.user_id
  WHERE r.cohort_id=_cohort AND public.organization_manage(oc.organization_id)
$$;
CREATE FUNCTION public.set_cohort_assignment_schedule(_cohort uuid,_expected integer,_enabled boolean,_hash text DEFAULT NULL)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE saved public.cohort_assignment_rules; plan jsonb; result integer;
BEGIN
  PERFORM public.organization_cohort_manage(_cohort);
  PERFORM 1 FROM public.cohorts WHERE id=_cohort FOR UPDATE;
  SELECT * INTO saved FROM public.cohort_assignment_rules WHERE cohort_id=_cohort FOR UPDATE;
  IF NOT FOUND OR _enabled IS NULL OR saved.version IS DISTINCT FROM _expected THEN RAISE EXCEPTION 'Assignment rule changed. Refresh before changing its schedule'; END IF;
  IF _enabled THEN
    plan:=public.cohort_assignment_rule_plan(saved.id);
    IF _hash IS NULL OR encode(sha256(convert_to(plan::text,'UTF8')),'hex')<>_hash THEN RAISE EXCEPTION 'Preview the matching roster before enabling scheduling'; END IF;
    IF (plan->>'seat_limit') IS NOT NULL AND (plan->>'current')::integer-jsonb_array_length(plan->'remove')+jsonb_array_length(plan->'add')>(plan->>'seat_limit')::integer THEN RAISE EXCEPTION 'Cohort capacity is too small for this rule. Increase the limit or narrow the criteria'; END IF;
  END IF;
  UPDATE public.cohort_assignment_rules SET enabled=_enabled,version=version+1,changed_by=auth.uid(),next_run=clock_timestamp()+make_interval(mins=>interval_minutes) WHERE id=saved.id RETURNING version INTO result;
  INSERT INTO public.audit_events(actor_id,action,entity_type,entity_id,metadata) VALUES(auth.uid(),'cohort.assignment_schedule_changed','cohort',_cohort::text,jsonb_build_object('enabled',_enabled,'version',result));
  RETURN result;
END;
$$;
CREATE FUNCTION public.organization_automation_status(_organization uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
  SELECT jsonb_build_object('scheduled',false,'last_run',(SELECT last_run FROM public.organization_automation_health WHERE id)) WHERE public.organization_manage(_organization)
$$;
CREATE FUNCTION public.cohort_assignment_rule_history(_cohort uuid)
RETURNS TABLE(request_id uuid,created_at timestamptz,actor_name text,result jsonb)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
  SELECT run.request_id,run.created_at,CASE WHEN run.actor_id IS NULL THEN 'Scheduled automation' ELSE coalesce(nullif(p.full_name,''),'Workspace manager') END,run.result
  FROM public.cohort_rule_runs run JOIN public.cohort_assignment_rules r ON r.id=run.rule_id JOIN public.organization_cohorts oc ON oc.cohort_id=r.cohort_id LEFT JOIN public.profiles p ON p.user_id=run.actor_id
  WHERE r.cohort_id=_cohort AND public.organization_manage(oc.organization_id)
$$;
CREATE FUNCTION public.cohort_assignment_rule_changes(_request uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
  SELECT jsonb_build_object('request_id',run.request_id,'created_at',run.created_at,'result',run.result,'changes',run.changes) FROM public.cohort_rule_runs run
  JOIN public.cohort_assignment_rules r ON r.id=run.rule_id JOIN public.organization_cohorts oc ON oc.cohort_id=r.cohort_id WHERE run.request_id=_request AND public.organization_manage(oc.organization_id)
$$;
REVOKE ALL ON FUNCTION public.cohort_rule_excluded_people(uuid),public.organization_automation_status(uuid),public.set_cohort_assignment_schedule(uuid,integer,boolean,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.cohort_rule_excluded_people(uuid),public.organization_automation_status(uuid),public.set_cohort_assignment_schedule(uuid,integer,boolean,text) TO authenticated;
REVOKE ALL ON FUNCTION public.cohort_assignment_rule_history(uuid),public.cohort_assignment_rule_changes(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.cohort_assignment_rule_history(uuid),public.cohort_assignment_rule_changes(uuid) TO authenticated;
COMMIT;
