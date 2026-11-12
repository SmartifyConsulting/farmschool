BEGIN;
DO $fixture$
DECLARE owner_ref uuid; creator_ref uuid:=gen_random_uuid(); successor_ref uuid:=gen_random_uuid(); learner_ref uuid:=gen_random_uuid(); org_ref uuid:=gen_random_uuid(); course_ref uuid; cohort_ref uuid:=gen_random_uuid();
BEGIN
  SELECT user_id INTO owner_ref FROM public.user_roles WHERE role='admin' LIMIT 1;
  INSERT INTO auth.users(id,aud,role,email,created_at,updated_at) VALUES(creator_ref,'authenticated','authenticated','billing-creator-'||creator_ref||'@example.invalid',now(),now()),(successor_ref,'authenticated','authenticated','billing-successor-'||successor_ref||'@example.invalid',now(),now()),(learner_ref,'authenticated','authenticated','billing-learner-'||learner_ref||'@example.invalid',now(),now());
  PERFORM set_config('request.jwt.claim.sub',owner_ref::text,true);
  PERFORM public.save_organization(org_ref,'Billing succession company','','#123456',NULL,0);
  PERFORM public.set_organization_member(org_ref,'billing-creator-'||creator_ref||'@example.invalid','manager',NULL,NULL,'Original creator',0);
  PERFORM public.set_organization_member(org_ref,'billing-successor-'||successor_ref||'@example.invalid','manager',NULL,NULL,'Successor',0);
  PERFORM public.set_organization_member(org_ref,'billing-learner-'||learner_ref||'@example.invalid','learner',NULL,NULL,'Learner',0);
  INSERT INTO public.studio_courses(author_id,title,description,price_cents,currency) VALUES(owner_ref,'Succession paid course','Named licence billing succession integration fixture',2000,'usd') RETURNING id INTO course_ref;
  INSERT INTO public.studio_lessons(course_id,title,kind,body,position) VALUES(course_ref,'Read','reading','Private paid company course',0);
  PERFORM public.set_course_organization(course_ref,org_ref,NULL); PERFORM public.studio_approve_review(course_ref); PERFORM public.studio_publish_version(course_ref,'Billing succession fixture');
  PERFORM set_config('test.bs_owner',owner_ref::text,true); PERFORM set_config('test.bs_creator',creator_ref::text,true); PERFORM set_config('test.bs_successor',successor_ref::text,true); PERFORM set_config('test.bs_learner',learner_ref::text,true);
  PERFORM set_config('test.bs_org',org_ref::text,true); PERFORM set_config('test.bs_course',course_ref::text,true); PERFORM set_config('test.bs_cohort',cohort_ref::text,true);
END;
$fixture$;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub',current_setting('test.bs_creator'),true);
DO $purchase$
DECLARE order_data jsonb;
BEGIN
  PERFORM public.create_organization_cohort(current_setting('test.bs_org')::uuid,current_setting('test.bs_cohort')::uuid,'Succession training cohort');
  PERFORM public.set_organization_cohort_member(current_setting('test.bs_cohort')::uuid,current_setting('test.bs_learner')::uuid,true);
  PERFORM public.set_organization_cohort_course(current_setting('test.bs_cohort')::uuid,current_setting('test.bs_course')::uuid,true,NULL);
  order_data:=public.create_course_license_order(current_setting('test.bs_cohort')::uuid,current_setting('test.bs_course')::uuid,1,gen_random_uuid());
  PERFORM set_config('test.bs_order',order_data::text,true);
END;
$purchase$;
RESET ROLE;
SET LOCAL ROLE service_role;
DO $fund$
DECLARE order_data jsonb:=current_setting('test.bs_order')::jsonb; session_ref text:='cs_succession_'||gen_random_uuid();
BEGIN
  PERFORM public.bind_course_license_checkout((order_data->>'id')::uuid,session_ref,'https://checkout.stripe.com/fixture');
  PERFORM public.apply_cohort_license_payment(jsonb_build_object('id','evt_succession_'||gen_random_uuid(),'type','test.payment','created',100,'action','paid','session',jsonb_build_object('id',session_ref,'created',90,'mode','payment','payment_status','paid','amount_total',2000,'currency','usd','metadata',jsonb_build_object('purchase_kind','cohort_license','license_order_id',order_data->>'id','course_id',order_data->>'course_id','cohort_id',order_data->>'cohort_id','user_id',order_data->>'buyer_id','quantity','1','price_cents','2000'))));
END;
$fund$;
RESET ROLE;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub',current_setting('test.bs_successor'),true);
DO $no_self_appointment$
DECLARE denied boolean:=false;
BEGIN
  IF public.my_cohort_billing_access(current_setting('test.bs_cohort')::uuid) THEN RAISE EXCEPTION 'Workspace management alone grants billing'; END IF;
  BEGIN PERFORM public.set_cohort_billing_manager(current_setting('test.bs_cohort')::uuid,auth.uid(),true,0,'Attempted self-appointment must always be rejected.'); EXCEPTION WHEN raise_exception THEN denied:=true; END;
  IF NOT denied THEN RAISE EXCEPTION 'Manager appointed themselves to billing'; END IF;
END;
$no_self_appointment$;
SELECT set_config('request.jwt.claim.sub',current_setting('test.bs_owner'),true);
SELECT public.set_cohort_billing_manager(current_setting('test.bs_cohort')::uuid,current_setting('test.bs_successor')::uuid,true,0,'Approved company billing succession before the original creator leaves.');
SELECT public.set_organization_member(current_setting('test.bs_org')::uuid,'billing-creator-'||current_setting('test.bs_creator')||'@example.invalid','learner',NULL,NULL,'Former manager',1);
DO $owner_access$
BEGIN
  IF NOT public.my_cohort_billing_access(current_setting('test.bs_cohort')::uuid) OR (public.cohort_billing_management(current_setting('test.bs_cohort')::uuid)->>'can_appoint')::boolean IS DISTINCT FROM true THEN RAISE EXCEPTION 'Company owner cannot administer billing succession'; END IF;
END;
$owner_access$;
SELECT set_config('request.jwt.claim.sub',current_setting('test.bs_successor'),true);
DO $handover$
DECLARE order_ref uuid:=(current_setting('test.bs_order')::jsonb->>'id')::uuid; report jsonb; seat_ref uuid; fresh_order jsonb;
BEGIN
  IF NOT public.my_cohort_billing_access(current_setting('test.bs_cohort')::uuid) OR NOT EXISTS(SELECT 1 FROM public.course_license_orders WHERE id=order_ref) THEN RAISE EXCEPTION 'Delegated manager cannot read funded order'; END IF;
  IF public.allocate_course_licenses(order_ref,ARRAY[current_setting('test.bs_learner')::uuid])<>1 THEN RAISE EXCEPTION 'Delegated manager cannot allocate existing funded seats'; END IF;
  report:=public.course_license_order_report(order_ref); seat_ref:=(report->'seats'->0->>'id')::uuid;
  IF report->'order'->>'buyer_id'<>current_setting('test.bs_creator') OR report->'seats'->0->>'user_id'<>current_setting('test.bs_learner') THEN RAISE EXCEPTION 'Billing handover changed buyer or learner identity'; END IF;
  PERFORM public.set_course_license_enabled(seat_ref,false,'Temporary suspension by the authorized successor manager.',1);
  PERFORM public.set_course_license_enabled(seat_ref,true,'Restored after the authorized successor manager completed review.',2);
  report:=public.course_license_order_report(order_ref);
  IF (report->>'used')::integer<>1 OR (report->>'remaining')::integer<>0 THEN RAISE EXCEPTION 'Handover or suspension released permanent named capacity'; END IF;
  fresh_order:=public.create_course_license_order(current_setting('test.bs_cohort')::uuid,current_setting('test.bs_course')::uuid,1,gen_random_uuid());
  IF fresh_order->>'buyer_id'<>current_setting('test.bs_successor') OR (fresh_order->>'unit_price_cents')::integer<>2000 THEN RAISE EXCEPTION 'Delegated new purchase used wrong buyer or client pricing'; END IF;
END;
$handover$;
SELECT set_config('request.jwt.claim.sub',current_setting('test.bs_owner'),true);
SELECT public.set_cohort_billing_manager(current_setting('test.bs_cohort')::uuid,current_setting('test.bs_successor')::uuid,false,1,'Delegated billing access is revoked after completion of the handover.');
SELECT set_config('request.jwt.claim.sub',current_setting('test.bs_successor'),true);
DO $revoked$
DECLARE denied boolean:=false;
BEGIN
  IF public.my_cohort_billing_access(current_setting('test.bs_cohort')::uuid) OR EXISTS(SELECT 1 FROM public.course_license_orders WHERE id=(current_setting('test.bs_order')::jsonb->>'id')::uuid) THEN RAISE EXCEPTION 'Revoked manager retains commercial read access'; END IF;
  BEGIN PERFORM public.course_license_order_report((current_setting('test.bs_order')::jsonb->>'id')::uuid); EXCEPTION WHEN raise_exception THEN denied:=true; END;
  IF NOT denied THEN RAISE EXCEPTION 'Revoked manager can export inventory'; END IF;
END;
$revoked$;
SELECT set_config('request.jwt.claim.sub',current_setting('test.bs_owner'),true);
SELECT public.set_cohort_billing_manager(current_setting('test.bs_cohort')::uuid,current_setting('test.bs_successor')::uuid,true,0,'Approved billing delegation to verify role-change cleanup.');
SELECT public.set_organization_member(current_setting('test.bs_org')::uuid,'billing-successor-'||current_setting('test.bs_successor')||'@example.invalid','learner',NULL,NULL,'Demoted successor',1);
SELECT public.set_organization_member(current_setting('test.bs_org')::uuid,'billing-successor-'||current_setting('test.bs_successor')||'@example.invalid','manager',NULL,NULL,'Reappointed workspace manager',2);
SELECT set_config('request.jwt.claim.sub',current_setting('test.bs_successor'),true);
DO $not_resurrected$
BEGIN
  IF public.my_cohort_billing_access(current_setting('test.bs_cohort')::uuid) THEN RAISE EXCEPTION 'Old billing delegation resurrected after role promotion'; END IF;
END;
$not_resurrected$;
SELECT set_config('request.jwt.claim.sub',current_setting('test.bs_learner'),true);
DO $learner_kept_access$
BEGIN
  IF NOT public.studio_course_visible(current_setting('test.bs_course')::uuid) THEN RAISE EXCEPTION 'Billing authority changes revoked funded learner access'; END IF;
END;
$learner_kept_access$;
RESET ROLE;
DO $preserved$
BEGIN
  IF NOT EXISTS(SELECT 1 FROM public.course_license_orders WHERE id=(current_setting('test.bs_order')::jsonb->>'id')::uuid AND buyer_id=current_setting('test.bs_creator')::uuid AND status='active') OR (SELECT count(*) FROM public.course_license_seats WHERE order_id=(current_setting('test.bs_order')::jsonb->>'id')::uuid)<>1 THEN RAISE EXCEPTION 'Financial history or named seat was rewritten'; END IF;
  IF has_table_privilege('authenticated','public.cohort_billing_managers','INSERT') OR public.has_role(current_setting('test.bs_successor')::uuid,'admin') THEN RAISE EXCEPTION 'Billing delegation bypasses protected writes or creates platform roles'; END IF;
END;
$preserved$;
ROLLBACK;
