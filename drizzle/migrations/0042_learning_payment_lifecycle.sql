BEGIN;

ALTER TABLE public.payment_events
  ADD COLUMN IF NOT EXISTS session_id text,
  ADD COLUMN IF NOT EXISTS event_created bigint,
  ADD COLUMN IF NOT EXISTS action text;
CREATE INDEX IF NOT EXISTS payment_events_session_idx ON public.payment_events(session_id, event_created);

CREATE OR REPLACE FUNCTION public.apply_learning_payment_event(_event jsonb)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  session_data jsonb := _event->'session';
  course_ref uuid := (session_data->'metadata'->>'course_id')::uuid;
  learner_ref uuid := (session_data->'metadata'->>'user_id')::uuid;
  session_ref text := session_data->>'id';
  event_action text := _event->>'action';
  course_row public.studio_courses;
  existing public.course_enrollments;
  final_status text;
  dispute_action text;
  inserted_count integer;
BEGIN
  IF _event->>'id' IS NULL OR session_ref IS NULL OR course_ref IS NULL OR learner_ref IS NULL
     OR event_action IS NULL OR event_action NOT IN ('paid','refunded','dispute_open','dispute_won','dispute_lost')
     OR session_data->>'payment_status' IS DISTINCT FROM 'paid'
     OR session_data->>'mode' IS DISTINCT FROM 'payment'
     OR (session_data->>'amount_total')::integer <= 0
     OR (_event->>'created')::bigint IS NULL
     OR (session_data->>'created')::bigint IS NULL THEN
    RAISE EXCEPTION 'Invalid course payment event';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(learner_ref::text || ':' || course_ref::text, 0));
  SELECT * INTO course_row FROM public.studio_courses WHERE id=course_ref;
  IF NOT FOUND THEN RAISE EXCEPTION 'Course unavailable'; END IF;
  SELECT * INTO existing FROM public.course_enrollments WHERE user_id=learner_ref AND course_id=course_ref;
  IF existing.stripe_session_id IS DISTINCT FROM session_ref THEN
    IF (session_data->>'amount_total')::integer <> COALESCE((session_data->'metadata'->>'price_cents')::integer, course_row.price_cents)
       OR session_data->>'currency' <> COALESCE(session_data->'metadata'->>'currency',course_row.currency) THEN
      RAISE EXCEPTION 'Payment amount mismatch';
    END IF;
  END IF;
  INSERT INTO public.payment_events(id,provider,event_type,session_id,event_created,action,status,processed_at)
  VALUES(_event->>'id','stripe',_event->>'type',session_ref,(_event->>'created')::bigint,event_action,'processed',now())
  ON CONFLICT(id) DO NOTHING;
  GET DIAGNOSTICS inserted_count = ROW_COUNT;
  IF inserted_count = 0 THEN RETURN 'duplicate'; END IF;
  IF EXISTS(SELECT 1 FROM public.payment_events WHERE session_id=session_ref AND action='refunded') THEN
    final_status := 'refunded';
  ELSE
    SELECT action INTO dispute_action FROM public.payment_events
    WHERE session_id=session_ref AND action IN ('dispute_open','dispute_won','dispute_lost')
    ORDER BY event_created DESC, (action <> 'dispute_open') DESC, (action = 'dispute_lost') DESC LIMIT 1;
    final_status := CASE WHEN dispute_action IN ('dispute_open','dispute_lost') THEN 'disputed' ELSE 'paid' END;
  END IF;
  INSERT INTO public.course_enrollments AS enrollment(user_id,course_id,amount_cents,currency,stripe_session_id,payment_provider,payment_status,paid_at)
  VALUES(learner_ref,course_ref,(session_data->>'amount_total')::integer,session_data->>'currency',session_ref,'stripe',final_status,to_timestamp((session_data->>'created')::bigint))
  ON CONFLICT(user_id,course_id) DO UPDATE SET
    amount_cents=EXCLUDED.amount_cents, currency=EXCLUDED.currency, stripe_session_id=EXCLUDED.stripe_session_id,
    payment_provider='stripe', payment_status=EXCLUDED.payment_status, paid_at=EXCLUDED.paid_at
  WHERE enrollment.stripe_session_id=EXCLUDED.stripe_session_id
     OR (enrollment.payment_status IN ('refunded','disputed') AND enrollment.paid_at <= EXCLUDED.paid_at);
  INSERT INTO public.audit_events(actor_id,action,entity_type,entity_id,metadata)
  VALUES(learner_ref,'course.payment_' || final_status,'course',course_ref::text,jsonb_build_object('provider','stripe','session_id',session_ref,'event_id',_event->>'id'));
  RETURN final_status;
END;
$$;
REVOKE ALL ON FUNCTION public.apply_learning_payment_event(jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.apply_learning_payment_event(jsonb) TO service_role;

CREATE OR REPLACE FUNCTION public.studio_course_visible(_course uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.studio_courses c WHERE c.id=_course
    AND (c.author_id=auth.uid() OR (c.published AND public.studio_prerequisite_satisfied(c.id)
      AND (c.price_cents=0 OR EXISTS (
        SELECT 1 FROM public.course_enrollments e WHERE e.course_id=c.id AND e.user_id=auth.uid()
          AND (e.payment_status IS NULL OR e.payment_status IN ('paid','free'))
      ))))
  )
$$;

COMMIT;
