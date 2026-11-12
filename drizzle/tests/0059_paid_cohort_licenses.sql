BEGIN;
DO $fixture$
DECLARE owner_ref uuid; course_ref uuid; prerequisite_ref uuid; cohort_ref uuid; reading_ref uuid; quiz_ref uuid; learner_ref uuid:=gen_random_uuid(); other_ref uuid:=gen_random_uuid(); personal_ref uuid:=gen_random_uuid();
BEGIN
  SELECT user_id INTO owner_ref FROM public.user_roles WHERE role='admin' LIMIT 1;
  IF owner_ref IS NULL THEN RAISE EXCEPTION 'Fixture owner required'; END IF;
  PERFORM set_config('request.jwt.claim.sub',owner_ref::text,true);
  INSERT INTO public.studio_courses(author_id,title,description) VALUES(owner_ref,'Rollback-only prerequisite','Verified prerequisite course used only in rolled back licence checks.') RETURNING id INTO prerequisite_ref;
  INSERT INTO public.studio_lessons(course_id,title,kind,body) VALUES(prerequisite_ref,'Introduction','reading','Read the introductory material.');
  PERFORM public.studio_approve_review(prerequisite_ref); PERFORM public.studio_publish_version(prerequisite_ref,'Rollback-only prerequisite');
  INSERT INTO public.studio_courses(author_id,title,description,price_cents,currency,prerequisite_course_id) VALUES(owner_ref,'Rollback-only paid cohort licences','Verified named-learner licensing with protected payment reconciliation.',2000,'usd',prerequisite_ref) RETURNING id INTO course_ref;
  INSERT INTO public.studio_lessons(course_id,title,kind,body,position) VALUES(course_ref,'Reading','reading','Read the practical course notes.',0) RETURNING id INTO reading_ref;
  INSERT INTO public.studio_lessons(course_id,title,kind,body,position) VALUES(course_ref,'Quiz','quiz','',1) RETURNING id INTO quiz_ref;
  PERFORM public.studio_save_quiz(quiz_ref,'Quiz',75,'[{"kind":"boolean","q":"Water required?"}]','[0]');
  PERFORM public.studio_approve_review(course_ref); PERFORM public.studio_publish_version(course_ref,'Rollback-only licence test');
  INSERT INTO public.cohorts(name,owner_id) VALUES('Rollback-only licence group',owner_ref) RETURNING id INTO cohort_ref;
  INSERT INTO public.cohort_members(cohort_id,user_id) VALUES(cohort_ref,learner_ref),(cohort_ref,other_ref),(cohort_ref,personal_ref);
  INSERT INTO public.cohort_course_assignments(cohort_id,course_id) VALUES(cohort_ref,course_ref);
  INSERT INTO public.course_enrollments(user_id,course_id,payment_status,amount_cents) VALUES(personal_ref,course_ref,'paid',2000);
  INSERT INTO public.certificates(user_id,source,course_ref,title) VALUES(personal_ref,'studio',prerequisite_ref::text,'Prerequisite fixture');
  PERFORM set_config('test.license_owner',owner_ref::text,true); PERFORM set_config('test.license_course',course_ref::text,true); PERFORM set_config('test.license_cohort',cohort_ref::text,true);
  PERFORM set_config('test.license_learner',learner_ref::text,true); PERFORM set_config('test.license_other',other_ref::text,true); PERFORM set_config('test.license_personal',personal_ref::text,true);
  PERFORM set_config('test.license_reading',reading_ref::text,true); PERFORM set_config('test.license_quiz',quiz_ref::text,true); PERFORM set_config('test.license_request',gen_random_uuid()::text,true);
  PERFORM set_config('test.license_prerequisite',prerequisite_ref::text,true);
END;
$fixture$;
SET LOCAL ROLE authenticated;
DO $order$
DECLARE order_data jsonb; duplicate jsonb; denied boolean:=false;
BEGIN
  order_data:=public.create_course_license_order(current_setting('test.license_cohort')::uuid,current_setting('test.license_course')::uuid,1,current_setting('test.license_request')::uuid);
  PERFORM set_config('test.license_order',order_data->>'id',true);
  duplicate:=public.create_course_license_order(current_setting('test.license_cohort')::uuid,current_setting('test.license_course')::uuid,1,current_setting('test.license_request')::uuid);
  IF order_data->>'id' IS DISTINCT FROM duplicate->>'id' OR (order_data->>'unit_price_cents')::integer<>2000 OR order_data->>'status'<>'pending' THEN RAISE EXCEPTION 'Order idempotency or price snapshot incorrect'; END IF;
  BEGIN PERFORM public.create_course_license_order(current_setting('test.license_cohort')::uuid,current_setting('test.license_course')::uuid,2,current_setting('test.license_request')::uuid); EXCEPTION WHEN raise_exception THEN denied:=true; END;
  IF NOT denied THEN RAISE EXCEPTION 'Purchase nonce reused for changed quantity'; END IF;
  denied:=false;
  BEGIN PERFORM public.allocate_course_licenses(current_setting('test.license_order')::uuid,ARRAY[current_setting('test.license_learner')::uuid]); EXCEPTION WHEN raise_exception THEN denied:=true; END;
  IF NOT denied THEN RAISE EXCEPTION 'Unpaid order allocated licences'; END IF;
  IF has_table_privilege('authenticated','public.course_license_orders','UPDATE') OR has_table_privilege('authenticated','public.course_license_seats','INSERT') THEN RAISE EXCEPTION 'Clients can mint paid licences'; END IF;
END;
$order$;
SELECT set_config('request.jwt.claim.sub',current_setting('test.license_learner'),true);
DO $$ BEGIN IF public.studio_course_visible(current_setting('test.license_course')::uuid) THEN RAISE EXCEPTION 'Redirect or pending order granted access'; END IF; END; $$;
RESET ROLE;
SELECT set_config('test.license_session','cs_bulk_'||current_setting('test.license_order'),true);
SELECT set_config('test.license_event',jsonb_build_object('id','evt_bulk_'||current_setting('test.license_order')||'_paid','type','checkout.session.completed','created',100,'action','paid','session',jsonb_build_object('id',current_setting('test.license_session'),'created',90,'mode','payment','payment_status','paid','amount_total',2000,'currency','usd','metadata',jsonb_build_object('purchase_kind','cohort_license','license_order_id',current_setting('test.license_order'),'cohort_id',current_setting('test.license_cohort'),'course_id',current_setting('test.license_course'),'user_id',current_setting('test.license_owner'),'quantity','1','price_cents','2000','currency','usd')))::text,true);
SET LOCAL ROLE service_role;
SELECT public.bind_course_license_checkout(current_setting('test.license_order')::uuid,current_setting('test.license_session'),'https://checkout.stripe.com/c/pay/rollback-only');
DO $payment$
DECLARE event_data jsonb:=current_setting('test.license_event')::jsonb; denied boolean:=false;
BEGIN
  BEGIN PERFORM public.apply_cohort_license_payment(jsonb_set(event_data,'{session,amount_total}','100')); EXCEPTION WHEN raise_exception THEN denied:=true; END;
  IF NOT denied THEN RAISE EXCEPTION 'Underpayment granted licences'; END IF;
  denied:=false;
  BEGIN PERFORM public.apply_learning_payment_event(event_data); EXCEPTION WHEN raise_exception THEN denied:=true; END;
  IF NOT denied THEN RAISE EXCEPTION 'Bulk event processed as personal purchase'; END IF;
  IF public.apply_cohort_license_payment(event_data)<>'active' THEN RAISE EXCEPTION 'Verified order not activated'; END IF;
  IF public.apply_cohort_license_payment(event_data)<>'duplicate' THEN RAISE EXCEPTION 'Duplicate payment event reprocessed'; END IF;
END;
$payment$;
RESET ROLE;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub',current_setting('test.license_owner'),true);
DO $allocate$
DECLARE denied boolean:=false; report jsonb;
BEGIN
  BEGIN PERFORM public.allocate_course_licenses(current_setting('test.license_order')::uuid,ARRAY[current_setting('test.license_personal')::uuid]); EXCEPTION WHEN raise_exception THEN denied:=true; END;
  IF NOT denied THEN RAISE EXCEPTION 'Personal purchaser consumed a redundant named seat'; END IF;
  IF public.allocate_course_licenses(current_setting('test.license_order')::uuid,ARRAY[current_setting('test.license_learner')::uuid])<>1 THEN RAISE EXCEPTION 'Paid named seat not allocated'; END IF;
  IF public.allocate_course_licenses(current_setting('test.license_order')::uuid,ARRAY[current_setting('test.license_learner')::uuid])<>0 THEN RAISE EXCEPTION 'Repeated allocation consumed another seat'; END IF;
  denied:=false;
  BEGIN PERFORM public.allocate_course_licenses(current_setting('test.license_order')::uuid,ARRAY[current_setting('test.license_other')::uuid]); EXCEPTION WHEN raise_exception THEN denied:=true; END;
  IF NOT denied THEN RAISE EXCEPTION 'Purchased capacity exceeded'; END IF;
  report:=public.course_license_order_report(current_setting('test.license_order')::uuid);
  IF (report->>'used')::integer<>1 OR (report->>'remaining')::integer<>0 THEN RAISE EXCEPTION 'Licence inventory incorrect'; END IF;
  PERFORM set_config('test.license_seat',report->'seats'->0->>'id',true);
  IF NOT EXISTS(SELECT 1 FROM public.course_assessment_learners(current_setting('test.license_course')::uuid) WHERE user_id=current_setting('test.license_learner')::uuid) THEN RAISE EXCEPTION 'Licensed learner missing from assessment workspace'; END IF;
END;
$allocate$;
SELECT set_config('request.jwt.claim.sub',current_setting('test.license_learner'),true);
DO $prerequisite$
BEGIN
  IF NOT public.my_course_paid_access(current_setting('test.license_course')::uuid) OR public.studio_course_visible(current_setting('test.license_course')::uuid) THEN RAISE EXCEPTION 'Licence bypassed course prerequisite'; END IF;
END;
$prerequisite$;
RESET ROLE;
INSERT INTO public.certificates(user_id,source,course_ref,title) VALUES(current_setting('test.license_learner')::uuid,'studio',current_setting('test.license_prerequisite'),'Prerequisite fixture');
SET LOCAL ROLE authenticated;
DO $learner$
DECLARE denied boolean:=false;
BEGIN
  IF NOT public.my_course_paid_access(current_setting('test.license_course')::uuid) OR NOT public.studio_course_visible(current_setting('test.license_course')::uuid) THEN RAISE EXCEPTION 'Named licence did not grant course access'; END IF;
  IF (SELECT count(*) FROM public.studio_lessons WHERE course_id=current_setting('test.license_course')::uuid)<>2 THEN RAISE EXCEPTION 'Licensed lesson reads denied'; END IF;
  IF EXISTS(SELECT 1 FROM public.course_license_orders WHERE id=current_setting('test.license_order')::uuid) THEN RAISE EXCEPTION 'Learner can read private billing records'; END IF;
  BEGIN PERFORM public.apply_cohort_license_payment(current_setting('test.license_event')::jsonb); EXCEPTION WHEN insufficient_privilege THEN denied:=true; END;
  IF NOT denied THEN RAISE EXCEPTION 'Learner can forge licence payment'; END IF;
  INSERT INTO public.lesson_progress(user_id,course_id,lesson_id,completed,position_seconds) VALUES(auth.uid(),current_setting('test.license_course'),current_setting('test.license_reading'),true,0);
END;
$learner$;
SELECT set_config('request.jwt.claim.sub',current_setting('test.license_owner'),true);
SELECT public.set_course_license_enabled(current_setting('test.license_seat')::uuid,false,'Group access paused while the learner record is reviewed.',1);
SELECT set_config('request.jwt.claim.sub',current_setting('test.license_learner'),true);
DO $$ BEGIN IF public.studio_course_visible(current_setting('test.license_course')::uuid) THEN RAISE EXCEPTION 'Suspended licence still grants access'; END IF; END; $$;
SELECT set_config('request.jwt.claim.sub',current_setting('test.license_owner'),true);
DO $restore$
DECLARE denied boolean:=false;
BEGIN
  BEGIN PERFORM public.set_course_license_enabled(current_setting('test.license_seat')::uuid,true,'A stale request must not overwrite the current licence status.',1); EXCEPTION WHEN raise_exception THEN denied:=true; END;
  IF NOT denied THEN RAISE EXCEPTION 'Stale licence update accepted'; END IF;
  PERFORM public.set_course_license_enabled(current_setting('test.license_seat')::uuid,true,'Review completed and group access restored to the same learner.',2);
  DELETE FROM public.cohort_members WHERE cohort_id=current_setting('test.license_cohort')::uuid AND user_id=current_setting('test.license_learner')::uuid;
  denied:=false;
  BEGIN PERFORM public.allocate_course_licenses(current_setting('test.license_order')::uuid,ARRAY[current_setting('test.license_other')::uuid]); EXCEPTION WHEN raise_exception THEN denied:=true; END;
  IF NOT denied THEN RAISE EXCEPTION 'Removed member made a named seat reusable'; END IF;
END;
$restore$;
SELECT set_config('request.jwt.claim.sub',current_setting('test.license_learner'),true);
DO $$ BEGIN IF public.studio_course_visible(current_setting('test.license_course')::uuid) THEN RAISE EXCEPTION 'Former member retains group access'; END IF; END; $$;
SELECT set_config('request.jwt.claim.sub',current_setting('test.license_owner'),true);
INSERT INTO public.cohort_members(cohort_id,user_id) VALUES(current_setting('test.license_cohort')::uuid,current_setting('test.license_learner')::uuid);
RESET ROLE;
INSERT INTO public.quiz_attempts(user_id,course_id,lesson_id,score,passed) VALUES(current_setting('test.license_learner')::uuid,current_setting('test.license_course'),current_setting('test.license_quiz'),100,true);
DO $certificate$
DECLARE manifest jsonb; issued jsonb;
BEGIN
  SELECT jsonb_agg(jsonb_build_object('id',id,'kind',kind,'body',body,'title',title,'video_url',video_url,'quiz',quiz) ORDER BY id) INTO manifest FROM public.studio_lessons WHERE course_id=current_setting('test.license_course')::uuid;
  issued:=public.issue_studio_certificate(current_setting('test.license_learner')::uuid,current_setting('test.license_course')::uuid,1,manifest,'[]');
  IF NOT EXISTS(SELECT 1 FROM public.certificates WHERE id=(issued->>'id')::uuid AND validated_at IS NOT NULL) THEN RAISE EXCEPTION 'Licensed completion cannot obtain a verified certificate'; END IF;
END;
$certificate$;
SET LOCAL ROLE service_role;
DO $lifecycle$
DECLARE base jsonb:=current_setting('test.license_event')::jsonb; event_data jsonb;
BEGIN
  event_data:=base||jsonb_build_object('id',(base->>'id')||'_dispute','created',200,'action','dispute_open','type','charge.dispute.created');
  IF public.apply_cohort_license_payment(event_data)<>'disputed' THEN RAISE EXCEPTION 'Dispute did not suspend order'; END IF;
END;
$lifecycle$;
RESET ROLE;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub',current_setting('test.license_learner'),true);
DO $$ BEGIN IF public.studio_course_visible(current_setting('test.license_course')::uuid) THEN RAISE EXCEPTION 'Disputed purchase grants licensed access'; END IF; END; $$;
SELECT set_config('request.jwt.claim.sub',current_setting('test.license_personal'),true);
DO $$ BEGIN IF NOT public.studio_course_visible(current_setting('test.license_course')::uuid) THEN RAISE EXCEPTION 'Group dispute revoked a personal purchase'; END IF; END; $$;
RESET ROLE;
SET LOCAL ROLE service_role;
DO $resolve$
DECLARE base jsonb:=current_setting('test.license_event')::jsonb;
BEGIN
  IF public.apply_cohort_license_payment(base||jsonb_build_object('id',(base->>'id')||'_won','created',300,'action','dispute_won'))<>'active' THEN RAISE EXCEPTION 'Won dispute did not restore purchase'; END IF;
  IF public.apply_cohort_license_payment(base||jsonb_build_object('id',(base->>'id')||'_late_open','created',250,'action','dispute_open'))<>'active' THEN RAISE EXCEPTION 'Older dispute arrival replaced newer result'; END IF;
  IF public.apply_cohort_license_payment(base||jsonb_build_object('id',(base->>'id')||'_refund','created',400,'action','refunded'))<>'refunded' THEN RAISE EXCEPTION 'Full refund did not revoke pool'; END IF;
  IF public.apply_cohort_license_payment(base||jsonb_build_object('id',(base->>'id')||'_late_paid','created',500,'action','paid'))<>'refunded' THEN RAISE EXCEPTION 'Late payment restored refunded licences'; END IF;
END;
$resolve$;
RESET ROLE;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub',current_setting('test.license_learner'),true);
DO $$ BEGIN IF public.studio_course_visible(current_setting('test.license_course')::uuid) THEN RAISE EXCEPTION 'Refunded licence still grants access'; END IF; END; $$;
RESET ROLE;
INSERT INTO public.course_enrollments(user_id,course_id,payment_status,amount_cents) VALUES(current_setting('test.license_learner')::uuid,current_setting('test.license_course')::uuid,'paid',2000);
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub',current_setting('test.license_learner'),true);
DO $independent$
BEGIN
  IF NOT public.studio_course_visible(current_setting('test.license_course')::uuid) THEN RAISE EXCEPTION 'Independent paid access was masked by refunded group licence'; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.certificates WHERE user_id=auth.uid() AND revoked_at IS NULL) THEN RAISE EXCEPTION 'Access refund rewrote historical achievement'; END IF;
END;
$independent$;
SELECT set_config('request.jwt.claim.sub',gen_random_uuid()::text,true);
DO $outsider$
DECLARE denied boolean:=false;
BEGIN
  BEGIN PERFORM public.course_license_order_report(current_setting('test.license_order')::uuid); EXCEPTION WHEN raise_exception THEN denied:=true; END;
  IF NOT denied THEN RAISE EXCEPTION 'Outsider can export named licence records'; END IF;
END;
$outsider$;
RESET ROLE;
ROLLBACK;
