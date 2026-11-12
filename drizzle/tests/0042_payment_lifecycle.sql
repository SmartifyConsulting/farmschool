BEGIN;

DO $test$
DECLARE
  owner_ref uuid;
  course_ref uuid;
  learner_ref uuid := gen_random_uuid();
  prefix text := gen_random_uuid()::text;
  event_data jsonb;
  result text;
  state text;
BEGIN
  SELECT user_id INTO owner_ref FROM public.user_roles WHERE role='admin' LIMIT 1;
  IF owner_ref IS NULL THEN RAISE EXCEPTION 'An administrator is required for fixture ownership'; END IF;
  PERFORM set_config('request.jwt.claim.sub',owner_ref::text,true);
  INSERT INTO public.studio_courses(author_id,title,description,price_cents,currency)
    VALUES(owner_ref,'Rollback-only payment verification','Temporary payment test',2000,'usd') RETURNING id INTO course_ref;
  event_data := jsonb_build_object('id',prefix||'-paid','type','test.payment','created',110,'action','paid',
    'session',jsonb_build_object('id','cs_'||prefix,'created',100,'mode','payment','payment_status','paid','amount_total',2000,'currency','usd',
      'metadata',jsonb_build_object('course_id',course_ref,'user_id',learner_ref)));
  result := public.apply_learning_payment_event(event_data);
  IF result <> 'paid' THEN RAISE EXCEPTION 'Initial payment failed'; END IF;
  result := public.apply_learning_payment_event(event_data);
  IF result <> 'duplicate' THEN RAISE EXCEPTION 'Duplicate guard failed'; END IF;
  PERFORM public.apply_learning_payment_event(event_data || jsonb_build_object('id',prefix||'-refund','created',130,'action','refunded'));
  PERFORM public.apply_learning_payment_event(event_data || jsonb_build_object('id',prefix||'-late-paid','created',110,'action','paid'));
  SELECT payment_status INTO state FROM public.course_enrollments WHERE user_id=learner_ref AND course_id=course_ref;
  IF state <> 'refunded' THEN RAISE EXCEPTION 'Refund precedence failed'; END IF;
  event_data := jsonb_set(event_data,'{session,id}',to_jsonb('cs_'||prefix||'-second'));
  event_data := jsonb_set(event_data,'{session,created}','200');
  PERFORM public.apply_learning_payment_event(event_data || jsonb_build_object('id',prefix||'-second','created',210,'action','paid'));
  SELECT payment_status INTO state FROM public.course_enrollments WHERE user_id=learner_ref AND course_id=course_ref;
  IF state <> 'paid' THEN RAISE EXCEPTION 'Repurchase failed'; END IF;
  PERFORM public.apply_learning_payment_event(event_data || jsonb_build_object('id',prefix||'-won','created',250,'action','dispute_won'));
  PERFORM public.apply_learning_payment_event(event_data || jsonb_build_object('id',prefix||'-late-open','created',240,'action','dispute_open'));
  PERFORM public.apply_learning_payment_event(event_data || jsonb_build_object('id',prefix||'-tied-open','created',250,'action','dispute_open'));
  SELECT payment_status INTO state FROM public.course_enrollments WHERE user_id=learner_ref AND course_id=course_ref;
  IF state <> 'paid' THEN RAISE EXCEPTION 'Dispute ordering failed'; END IF;
  PERFORM public.apply_learning_payment_event(event_data || jsonb_build_object('id',prefix||'-lost','created',270,'action','dispute_lost'));
  PERFORM public.apply_learning_payment_event(event_data || jsonb_build_object('id',prefix||'-delayed-paid','created',280,'action','paid'));
  SELECT payment_status INTO state FROM public.course_enrollments WHERE user_id=learner_ref AND course_id=course_ref;
  IF state <> 'disputed' THEN RAISE EXCEPTION 'Dispute suspension failed'; END IF;
  event_data := jsonb_set(event_data,'{session,id}',to_jsonb('cs_'||prefix||'-third'));
  event_data := jsonb_set(event_data,'{session,created}','300');
  PERFORM public.apply_learning_payment_event(event_data || jsonb_build_object('id',prefix||'-third','created',310,'action','paid'));
  event_data := jsonb_set(event_data,'{session,id}',to_jsonb('cs_'||prefix));
  event_data := jsonb_set(event_data,'{session,created}','100');
  PERFORM public.apply_learning_payment_event(event_data || jsonb_build_object('id',prefix||'-old-refund','created',350,'action','refunded'));
  SELECT payment_status INTO state FROM public.course_enrollments WHERE user_id=learner_ref AND course_id=course_ref;
  IF state <> 'paid' THEN RAISE EXCEPTION 'Old refund affected new purchase'; END IF;
  IF has_function_privilege('authenticated','public.apply_learning_payment_event(jsonb)','EXECUTE')
     OR has_function_privilege('anon','public.apply_learning_payment_event(jsonb)','EXECUTE')
     OR NOT has_function_privilege('service_role','public.apply_learning_payment_event(jsonb)','EXECUTE') THEN
    RAISE EXCEPTION 'Payment function grants failed';
  END IF;
END;
$test$;

ROLLBACK;
