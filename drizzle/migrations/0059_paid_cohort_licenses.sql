BEGIN;

CREATE TABLE public.course_license_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), request_id uuid NOT NULL UNIQUE,
  course_id uuid NOT NULL REFERENCES public.studio_courses(id), cohort_id uuid NOT NULL REFERENCES public.cohorts(id),
  buyer_id uuid NOT NULL, course_title text NOT NULL,
  quantity integer NOT NULL CHECK(quantity BETWEEN 1 AND 1000), unit_price_cents integer NOT NULL CHECK(unit_price_cents>0),
  currency text NOT NULL CHECK(currency ~ '^[a-z]{3}$'),
  status text NOT NULL DEFAULT 'pending' CHECK(status IN('pending','active','refunded','disputed')),
  stripe_session_id text UNIQUE, checkout_url text, created_at timestamptz NOT NULL DEFAULT now(), paid_at timestamptz,
  CHECK(quantity::bigint*unit_price_cents<=99999999)
);
CREATE TABLE public.course_license_seats (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), order_id uuid NOT NULL REFERENCES public.course_license_orders(id),
  user_id uuid NOT NULL, allocated_by uuid NOT NULL, allocated_at timestamptz NOT NULL DEFAULT now(),
  enabled boolean NOT NULL DEFAULT true, version integer NOT NULL DEFAULT 1,
  note text NOT NULL DEFAULT 'Named licence allocated from a verified bulk purchase.',
  UNIQUE(order_id,user_id)
);
CREATE TABLE public.course_license_seat_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), seat_id uuid NOT NULL REFERENCES public.course_license_seats(id),
  actor_id uuid NOT NULL, enabled boolean NOT NULL, reason text NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX course_license_orders_cohort_course ON public.course_license_orders(cohort_id,course_id,status);
CREATE INDEX course_license_seats_user ON public.course_license_seats(user_id,order_id) WHERE enabled;
ALTER TABLE public.course_license_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.course_license_seats ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.course_license_seat_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.course_license_orders,public.course_license_seats,public.course_license_seat_events FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.course_license_orders,public.course_license_seats,public.course_license_seat_events TO authenticated;
GRANT ALL ON public.course_license_orders,public.course_license_seats,public.course_license_seat_events TO service_role;
CREATE POLICY license_orders_owner_read ON public.course_license_orders FOR SELECT TO authenticated USING(EXISTS(SELECT 1 FROM public.cohorts c WHERE c.id=cohort_id AND c.owner_id=auth.uid()));
CREATE POLICY license_seats_read ON public.course_license_seats FOR SELECT TO authenticated USING(user_id=auth.uid() OR EXISTS(SELECT 1 FROM public.course_license_orders o JOIN public.cohorts c ON c.id=o.cohort_id WHERE o.id=order_id AND c.owner_id=auth.uid()));
CREATE POLICY license_events_read ON public.course_license_seat_events FOR SELECT TO authenticated USING(EXISTS(SELECT 1 FROM public.course_license_seats s WHERE s.id=seat_id));

CREATE FUNCTION public.course_paid_entitled(_course uuid,_user uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
  SELECT _user IS NOT NULL AND (EXISTS(SELECT 1 FROM public.course_enrollments e WHERE e.course_id=_course AND e.user_id=_user AND (e.payment_status IS NULL OR e.payment_status IN('paid','free')))
    OR EXISTS(SELECT 1 FROM public.course_license_seats s JOIN public.course_license_orders o ON o.id=s.order_id
      JOIN public.cohort_members m ON m.cohort_id=o.cohort_id AND m.user_id=s.user_id
      JOIN public.cohort_course_assignments a ON a.cohort_id=o.cohort_id AND a.course_id=o.course_id
      WHERE s.user_id=_user AND s.enabled AND o.course_id=_course AND o.status='active'))
$$;
REVOKE ALL ON FUNCTION public.course_paid_entitled(uuid,uuid) FROM PUBLIC,anon,authenticated;
CREATE FUNCTION public.my_course_paid_access(_course uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
  SELECT public.course_paid_entitled(_course,auth.uid())
$$;
REVOKE ALL ON FUNCTION public.my_course_paid_access(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.my_course_paid_access(uuid) TO authenticated;
CREATE OR REPLACE FUNCTION public.studio_course_visible(_course uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
  SELECT EXISTS(SELECT 1 FROM public.studio_courses c WHERE c.id=_course AND
    (c.author_id=auth.uid() OR (c.published AND public.studio_prerequisite_satisfied(c.id) AND (c.price_cents=0 OR public.course_paid_entitled(c.id,auth.uid())))))
$$;

CREATE FUNCTION public.lock_course_license_access(_course uuid,_user uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
  PERFORM 1 FROM public.studio_courses WHERE id=_course FOR SHARE;
  PERFORM 1 FROM public.course_license_seats s JOIN public.course_license_orders o ON o.id=s.order_id
    JOIN public.cohort_members m ON m.cohort_id=o.cohort_id AND m.user_id=s.user_id
    JOIN public.cohort_course_assignments a ON a.cohort_id=o.cohort_id AND a.course_id=o.course_id
    WHERE s.user_id=_user AND s.enabled AND o.course_id=_course AND o.status='active'
    ORDER BY o.id,s.id FOR SHARE OF s,o,m,a;
END;
$$;
REVOKE ALL ON FUNCTION public.lock_course_license_access(uuid,uuid) FROM PUBLIC,anon,authenticated;

CREATE FUNCTION public.create_course_license_order(_cohort uuid,_course uuid,_quantity integer,_request uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE course_row public.studio_courses; order_row public.course_license_orders;
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_role(auth.uid(),'admin') THEN RAISE EXCEPTION 'Administrator access required'; END IF;
  SELECT * INTO course_row FROM public.studio_courses WHERE id=_course AND published AND revision_of IS NULL FOR SHARE;
  IF NOT FOUND OR course_row.price_cents<=0 THEN RAISE EXCEPTION 'Choose a published paid course'; END IF;
  PERFORM 1 FROM public.cohorts WHERE id=_cohort AND owner_id=auth.uid() FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Only the cohort owner can buy learner licences'; END IF;
  IF _request IS NULL OR _quantity IS NULL OR _quantity NOT BETWEEN 1 AND 1000 OR _quantity::bigint*course_row.price_cents>99999999 THEN RAISE EXCEPTION 'Choose 1 to 1000 licences within the supported order total'; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.cohort_course_assignments WHERE cohort_id=_cohort AND course_id=_course) THEN RAISE EXCEPTION 'Assign this course to the cohort before buying licences'; END IF;
  SELECT * INTO order_row FROM public.course_license_orders WHERE request_id=_request FOR UPDATE;
  IF FOUND THEN
    IF order_row.buyer_id<>auth.uid() OR order_row.cohort_id<>_cohort OR order_row.course_id<>_course OR order_row.quantity<>_quantity THEN RAISE EXCEPTION 'Purchase request changed. Start a fresh purchase'; END IF;
    IF order_row.status='pending' AND order_row.created_at<clock_timestamp()-interval '23 hours' THEN RAISE EXCEPTION 'This purchase request expired. Start a fresh purchase'; END IF;
  ELSE
    INSERT INTO public.course_license_orders(request_id,course_id,cohort_id,buyer_id,course_title,quantity,unit_price_cents,currency)
      VALUES(_request,_course,_cohort,auth.uid(),course_row.title,_quantity,course_row.price_cents,lower(course_row.currency)) RETURNING * INTO order_row;
  END IF;
  RETURN to_jsonb(order_row);
END;
$$;
CREATE FUNCTION public.bind_course_license_checkout(_order uuid,_session text,_url text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
  IF _session IS NULL OR _session !~ '^cs_' OR _url IS NULL OR _url !~ '^https://' THEN RAISE EXCEPTION 'Checkout confirmation required'; END IF;
  UPDATE public.course_license_orders SET stripe_session_id=_session,checkout_url=_url WHERE id=_order AND (stripe_session_id IS NULL OR stripe_session_id=_session);
  IF NOT FOUND THEN RAISE EXCEPTION 'Checkout session changed'; END IF;
END;
$$;
REVOKE ALL ON FUNCTION public.create_course_license_order(uuid,uuid,integer,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.create_course_license_order(uuid,uuid,integer,uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.bind_course_license_checkout(uuid,text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.bind_course_license_checkout(uuid,text,text) TO service_role;

CREATE FUNCTION public.apply_cohort_license_payment(_event jsonb)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE session_data jsonb:=_event->'session'; metadata jsonb:=session_data->'metadata'; order_ref uuid:=(metadata->>'license_order_id')::uuid;
  session_ref text:=session_data->>'id'; action_name text:=_event->>'action'; order_row public.course_license_orders; course_ref uuid;
  inserted integer; final_status text; dispute_action text;
BEGIN
  IF _event->>'id' IS NULL OR order_ref IS NULL OR session_ref IS NULL OR session_ref !~ '^cs_' OR metadata->>'purchase_kind' IS DISTINCT FROM 'cohort_license'
    OR action_name IS NULL OR action_name NOT IN('paid','refunded','dispute_open','dispute_won','dispute_lost')
    OR session_data->>'payment_status' IS DISTINCT FROM 'paid' OR session_data->>'mode' IS DISTINCT FROM 'payment'
    OR (_event->>'created')::bigint IS NULL OR (session_data->>'created')::bigint IS NULL THEN RAISE EXCEPTION 'Invalid licence payment event'; END IF;
  SELECT course_id INTO course_ref FROM public.course_license_orders WHERE id=order_ref;
  PERFORM 1 FROM public.studio_courses WHERE id=course_ref FOR UPDATE;
  SELECT * INTO order_row FROM public.course_license_orders WHERE id=order_ref FOR UPDATE;
  IF NOT FOUND OR metadata->>'course_id' IS DISTINCT FROM order_row.course_id::text OR metadata->>'cohort_id' IS DISTINCT FROM order_row.cohort_id::text
    OR metadata->>'user_id' IS DISTINCT FROM order_row.buyer_id::text OR metadata->>'quantity' IS DISTINCT FROM order_row.quantity::text
    OR metadata->>'price_cents' IS DISTINCT FROM order_row.unit_price_cents::text
    OR session_data->>'currency' IS DISTINCT FROM order_row.currency
    OR (session_data->>'amount_total')::bigint IS DISTINCT FROM order_row.quantity::bigint*order_row.unit_price_cents
    OR (order_row.stripe_session_id IS NOT NULL AND order_row.stripe_session_id<>session_ref) THEN RAISE EXCEPTION 'Licence payment does not match its order'; END IF;
  INSERT INTO public.payment_events(id,provider,event_type,session_id,event_created,action,status,processed_at)
    VALUES(_event->>'id','stripe',_event->>'type',session_ref,(_event->>'created')::bigint,action_name,'processed',clock_timestamp()) ON CONFLICT(id) DO NOTHING;
  GET DIAGNOSTICS inserted=ROW_COUNT;
  IF inserted=0 THEN RETURN 'duplicate'; END IF;
  IF EXISTS(SELECT 1 FROM public.payment_events WHERE session_id=session_ref AND action='refunded') THEN final_status:='refunded';
  ELSE
    SELECT action INTO dispute_action FROM public.payment_events WHERE session_id=session_ref AND action IN('dispute_open','dispute_won','dispute_lost')
      ORDER BY event_created DESC,(action<>'dispute_open') DESC,(action='dispute_lost') DESC LIMIT 1;
    final_status:=CASE WHEN dispute_action IN('dispute_open','dispute_lost') THEN 'disputed' ELSE 'active' END;
  END IF;
  UPDATE public.course_license_orders SET status=final_status,stripe_session_id=session_ref,paid_at=coalesce(paid_at,to_timestamp((session_data->>'created')::bigint)) WHERE id=order_ref;
  INSERT INTO public.audit_events(actor_id,action,entity_type,entity_id,metadata)
    VALUES(order_row.buyer_id,'cohort.license_payment_'||final_status,'license_order',order_ref::text,jsonb_build_object('session_id',session_ref,'event_id',_event->>'id','quantity',order_row.quantity));
  RETURN final_status;
END;
$$;
REVOKE ALL ON FUNCTION public.apply_cohort_license_payment(jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.apply_cohort_license_payment(jsonb) TO service_role;

CREATE FUNCTION public.allocate_course_licenses(_order uuid,_learners uuid[])
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE order_row public.course_license_orders; course_ref uuid; person uuid; used integer; needed integer; allocated integer:=0; new_seat uuid;
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_role(auth.uid(),'admin') THEN RAISE EXCEPTION 'Administrator access required'; END IF;
  SELECT o.course_id INTO course_ref FROM public.course_license_orders o JOIN public.cohorts c ON c.id=o.cohort_id WHERE o.id=_order AND c.owner_id=auth.uid();
  IF NOT FOUND THEN RAISE EXCEPTION 'Only the cohort owner can allocate licences'; END IF;
  PERFORM 1 FROM public.studio_courses WHERE id=course_ref FOR SHARE;
  SELECT * INTO order_row FROM public.course_license_orders WHERE id=_order FOR UPDATE;
  IF order_row.status<>'active' THEN RAISE EXCEPTION 'This licence purchase is not active'; END IF;
  PERFORM 1 FROM public.cohort_course_assignments WHERE cohort_id=order_row.cohort_id AND course_id=order_row.course_id FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Assign this course to the cohort first'; END IF;
  IF coalesce(array_length(_learners,1),0) NOT BETWEEN 1 AND 1000 OR (SELECT count(DISTINCT value) FROM unnest(_learners) value)<>array_length(_learners,1) THEN RAISE EXCEPTION 'Choose 1 to 1000 distinct learners'; END IF;
  PERFORM 1 FROM public.cohort_members WHERE cohort_id=order_row.cohort_id AND user_id=ANY(_learners) ORDER BY user_id FOR SHARE;
  IF (SELECT count(*) FROM public.cohort_members WHERE cohort_id=order_row.cohort_id AND user_id=ANY(_learners))<>array_length(_learners,1) THEN RAISE EXCEPTION 'Choose current cohort members'; END IF;
  SELECT count(*) INTO used FROM public.course_license_seats WHERE order_id=_order;
  SELECT count(*) INTO needed FROM unnest(_learners) person_id WHERE NOT EXISTS(SELECT 1 FROM public.course_license_seats WHERE order_id=_order AND user_id=person_id);
  IF used+needed>order_row.quantity THEN RAISE EXCEPTION 'Not enough unallocated named licences'; END IF;
  FOREACH person IN ARRAY _learners LOOP
    IF EXISTS(SELECT 1 FROM public.course_license_seats WHERE order_id=_order AND user_id=person) THEN CONTINUE; END IF;
    IF EXISTS(SELECT 1 FROM public.course_enrollments WHERE course_id=course_ref AND user_id=person AND (payment_status IS NULL OR payment_status IN('paid','free'))) THEN RAISE EXCEPTION 'A selected learner already has personal course access'; END IF;
    IF EXISTS(SELECT 1 FROM public.course_license_seats s JOIN public.course_license_orders o ON o.id=s.order_id WHERE o.cohort_id=order_row.cohort_id AND o.course_id=course_ref AND o.status='active' AND s.user_id=person AND s.enabled) THEN RAISE EXCEPTION 'A selected learner already has an active cohort licence'; END IF;
    INSERT INTO public.course_license_seats(order_id,user_id,allocated_by) VALUES(_order,person,auth.uid()) RETURNING id INTO new_seat;
    INSERT INTO public.course_license_seat_events(seat_id,actor_id,enabled,reason) VALUES(new_seat,auth.uid(),true,'Named learner licence allocated from a verified bulk purchase.');
    allocated:=allocated+1;
  END LOOP;
  RETURN allocated;
END;
$$;
CREATE FUNCTION public.set_course_license_enabled(_seat uuid,_enabled boolean,_reason text,_expected_version integer)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE order_row public.course_license_orders; seat_row public.course_license_seats;
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_role(auth.uid(),'admin') OR _enabled IS NULL OR _reason IS NULL OR char_length(btrim(_reason)) NOT BETWEEN 20 AND 2000 THEN RAISE EXCEPTION 'Administrator access and a reason of 20 to 2000 characters are required'; END IF;
  SELECT o.* INTO order_row FROM public.course_license_orders o JOIN public.course_license_seats s ON s.order_id=o.id JOIN public.cohorts c ON c.id=o.cohort_id WHERE s.id=_seat AND c.owner_id=auth.uid();
  IF NOT FOUND THEN RAISE EXCEPTION 'Only the cohort owner can change this licence'; END IF;
  PERFORM 1 FROM public.studio_courses WHERE id=order_row.course_id FOR UPDATE;
  SELECT * INTO order_row FROM public.course_license_orders WHERE id=order_row.id FOR SHARE;
  IF _enabled AND order_row.status<>'active' THEN RAISE EXCEPTION 'Restore the purchase before enabling learner access'; END IF;
  SELECT * INTO seat_row FROM public.course_license_seats WHERE id=_seat FOR UPDATE;
  IF seat_row.version IS DISTINCT FROM _expected_version THEN RAISE EXCEPTION 'Licence changed. Refresh before saving'; END IF;
  UPDATE public.course_license_seats SET enabled=_enabled,note=btrim(_reason),version=version+1 WHERE id=_seat;
  INSERT INTO public.course_license_seat_events(seat_id,actor_id,enabled,reason) VALUES(_seat,auth.uid(),_enabled,btrim(_reason));
END;
$$;
REVOKE ALL ON FUNCTION public.allocate_course_licenses(uuid,uuid[]),public.set_course_license_enabled(uuid,boolean,text,integer) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.allocate_course_licenses(uuid,uuid[]),public.set_course_license_enabled(uuid,boolean,text,integer) TO authenticated;

DO $$
DECLARE definition text; original text; replacement text; routine text;
BEGIN
  FOREACH routine IN ARRAY ARRAY['issue_studio_certificate(uuid,uuid,integer,jsonb,jsonb)','start_quiz_exam(uuid,uuid,text,jsonb,jsonb,integer[])','finish_quiz_exam(uuid,uuid,uuid,jsonb,jsonb)'] LOOP
    SELECT pg_get_functiondef(('public.'||routine)::regprocedure) INTO definition;
    original:='PERFORM set_config(''request.jwt.claim.sub'',_user::text,true);';
    replacement:='PERFORM public.lock_course_license_access('||CASE WHEN routine LIKE 'issue_%' THEN '_course' ELSE 'course_ref' END||',_user); '||original;
    IF strpos(definition,original)=0 THEN RAISE EXCEPTION 'Unexpected licensing lock target: %',routine; END IF;
    EXECUTE replace(definition,original,replacement);
  END LOOP;
  SELECT pg_get_functiondef('public.submit_competency_work(uuid,text,text,integer)'::regprocedure) INTO definition;
  original:='IF NOT course_row.published OR course_row.author_id=auth.uid() OR NOT public.studio_course_visible(course_row.id) THEN';
  IF strpos(definition,original)=0 THEN RAISE EXCEPTION 'Unexpected submission access definition'; END IF;
  EXECUTE replace(definition,original,'PERFORM public.lock_course_license_access(course_row.id,auth.uid()); '||original);
  SELECT pg_get_functiondef('public.course_assessment_learners(uuid)'::regprocedure) INTO definition;
  original:='c.price_cents=0 OR EXISTS(SELECT 1 FROM public.course_enrollments e WHERE e.course_id=_course AND e.user_id=candidate.user_id AND (e.payment_status IS NULL OR e.payment_status IN (''paid'',''free'')))';
  IF strpos(definition,original)=0 THEN RAISE EXCEPTION 'Unexpected assessment entitlement definition'; END IF;
  EXECUTE replace(definition,original,'c.price_cents=0 OR public.course_paid_entitled(_course,candidate.user_id)');
  SELECT pg_get_functiondef('public.cohort_progress_report(uuid,integer,integer)'::regprocedure) INTO definition;
  original:='c.price_cents=0 OR EXISTS(SELECT 1 FROM public.course_enrollments e WHERE e.course_id=c.id AND e.user_id=m.user_id AND (e.payment_status IS NULL OR e.payment_status IN(''paid'',''free'')))';
  IF strpos(definition,original)=0 THEN RAISE EXCEPTION 'Unexpected cohort entitlement definition'; END IF;
  EXECUTE replace(definition,original,'c.price_cents=0 OR public.course_paid_entitled(c.id,m.user_id)');
  SELECT pg_get_functiondef('public.apply_learning_payment_event(jsonb)'::regprocedure) INTO definition;
  original:='IF _event->>''id'' IS NULL';
  IF strpos(definition,original)=0 THEN RAISE EXCEPTION 'Unexpected personal payment definition'; END IF;
  EXECUTE replace(definition,original,'IF session_data->''metadata''->>''purchase_kind''=''cohort_license'' THEN RAISE EXCEPTION ''Bulk licences require their order processor''; END IF; '||original);
END;
$$;

CREATE FUNCTION public.course_license_candidates(_cohort uuid,_course uuid)
RETURNS TABLE(user_id uuid,full_name text,personal_access boolean,cohort_access boolean) LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_role(auth.uid(),'admin') OR NOT EXISTS(SELECT 1 FROM public.cohorts WHERE id=_cohort AND owner_id=auth.uid()) THEN RAISE EXCEPTION 'Cohort administrator access required'; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.cohort_course_assignments WHERE cohort_id=_cohort AND course_id=_course) THEN RAISE EXCEPTION 'Choose a course assigned to this cohort'; END IF;
  RETURN QUERY SELECT m.user_id,coalesce(nullif(p.full_name,''),'Learner'),
    EXISTS(SELECT 1 FROM public.course_enrollments e WHERE e.course_id=_course AND e.user_id=m.user_id AND (e.payment_status IS NULL OR e.payment_status IN('paid','free'))),
    EXISTS(SELECT 1 FROM public.course_license_seats s JOIN public.course_license_orders o ON o.id=s.order_id WHERE s.user_id=m.user_id AND s.enabled AND o.cohort_id=_cohort AND o.course_id=_course AND o.status='active')
  FROM public.cohort_members m LEFT JOIN public.profiles p ON p.user_id=m.user_id WHERE m.cohort_id=_cohort ORDER BY coalesce(p.full_name,'Learner'),m.user_id;
END;
$$;
CREATE FUNCTION public.course_license_allocations(_order uuid)
RETURNS TABLE(id uuid,user_id uuid,full_name text,enabled boolean,version integer,note text,allocated_at timestamptz,current_member boolean)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE cohort_ref uuid;
BEGIN
  SELECT o.cohort_id INTO cohort_ref FROM public.course_license_orders o JOIN public.cohorts c ON c.id=o.cohort_id WHERE o.id=_order AND c.owner_id=auth.uid();
  IF NOT FOUND OR auth.uid() IS NULL OR NOT public.has_role(auth.uid(),'admin') THEN RAISE EXCEPTION 'Cohort administrator access required'; END IF;
  RETURN QUERY SELECT s.id,s.user_id,coalesce(nullif(p.full_name,''),'Learner'),s.enabled,s.version,s.note,s.allocated_at,
    EXISTS(SELECT 1 FROM public.cohort_members m WHERE m.cohort_id=cohort_ref AND m.user_id=s.user_id)
  FROM public.course_license_seats s LEFT JOIN public.profiles p ON p.user_id=s.user_id WHERE s.order_id=_order ORDER BY s.allocated_at,s.id;
END;
$$;
REVOKE ALL ON FUNCTION public.course_license_candidates(uuid,uuid),public.course_license_allocations(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.course_license_candidates(uuid,uuid),public.course_license_allocations(uuid) TO authenticated;

CREATE FUNCTION public.course_license_order_report(_order uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE order_row public.course_license_orders; seats jsonb;
BEGIN
  SELECT o.* INTO order_row FROM public.course_license_orders o JOIN public.cohorts c ON c.id=o.cohort_id WHERE o.id=_order AND c.owner_id=auth.uid();
  IF NOT FOUND OR auth.uid() IS NULL OR NOT public.has_role(auth.uid(),'admin') THEN RAISE EXCEPTION 'Cohort administrator access required'; END IF;
  SELECT coalesce(jsonb_agg(to_jsonb(item) ORDER BY item.allocated_at,item.id),'[]') INTO seats FROM public.course_license_allocations(_order) item;
  RETURN jsonb_build_object('order',to_jsonb(order_row),'seats',seats,'used',jsonb_array_length(seats),'remaining',order_row.quantity-jsonb_array_length(seats));
END;
$$;
REVOKE ALL ON FUNCTION public.course_license_order_report(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.course_license_order_report(uuid) TO authenticated;

COMMIT;
