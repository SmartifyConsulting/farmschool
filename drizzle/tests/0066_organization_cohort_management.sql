BEGIN;
DO $fixture$
DECLARE owner_ref uuid; manager_a uuid:=gen_random_uuid(); manager_b uuid:=gen_random_uuid(); learner_ref uuid:=gen_random_uuid(); outsider_ref uuid:=gen_random_uuid(); org_ref uuid:=gen_random_uuid(); other_org uuid:=gen_random_uuid(); paid_ref uuid; free_ref uuid;
BEGIN
  SELECT user_id INTO owner_ref FROM public.user_roles WHERE role='admin' LIMIT 1;
  INSERT INTO auth.users(id,aud,role,email,created_at,updated_at) VALUES(manager_a,'authenticated','authenticated','cohort-manager-a-'||manager_a||'@example.invalid',now(),now()),(manager_b,'authenticated','authenticated','cohort-manager-b-'||manager_b||'@example.invalid',now(),now()),(learner_ref,'authenticated','authenticated','cohort-learner-'||learner_ref||'@example.invalid',now(),now()),(outsider_ref,'authenticated','authenticated','cohort-outsider-'||outsider_ref||'@example.invalid',now(),now());
  PERFORM set_config('request.jwt.claim.sub',owner_ref::text,true);
  PERFORM public.save_organization(org_ref,'Cohort management tenant','','#123456',NULL,0); PERFORM public.save_organization(other_org,'Other cohort tenant','','#654321',NULL,0);
  PERFORM public.set_organization_member(org_ref,'cohort-manager-a-'||manager_a||'@example.invalid','manager',NULL,NULL,'Manager A',0);
  PERFORM public.set_organization_member(org_ref,'cohort-manager-b-'||manager_b||'@example.invalid','manager',NULL,NULL,'Manager B',0);
  PERFORM public.set_organization_member(org_ref,'cohort-learner-'||learner_ref||'@example.invalid','learner',NULL,NULL,'Learner',0);
  PERFORM public.set_organization_member(other_org,'cohort-outsider-'||outsider_ref||'@example.invalid','manager',NULL,NULL,'Other manager',0);
  INSERT INTO public.studio_courses(author_id,title,description,price_cents,currency) VALUES(owner_ref,'Tenant paid course','Organization manager licensing integration fixture',2000,'usd') RETURNING id INTO paid_ref;
  INSERT INTO public.studio_lessons(course_id,title,kind,body,position) VALUES(paid_ref,'Read','reading','Private paid training content',0);
  PERFORM public.set_course_organization(paid_ref,org_ref,NULL); PERFORM public.studio_approve_review(paid_ref); PERFORM public.studio_publish_version(paid_ref,'Tenant billing fixture');
  INSERT INTO public.studio_courses(author_id,title,description) VALUES(owner_ref,'Tenant free course','Organization free auto-enrolment integration fixture') RETURNING id INTO free_ref;
  INSERT INTO public.studio_lessons(course_id,title,kind,body,position) VALUES(free_ref,'Read','reading','Free training content',0);
  PERFORM public.studio_approve_review(free_ref); PERFORM public.studio_publish_version(free_ref,'Tenant free fixture');
  PERFORM set_config('test.tc_owner',owner_ref::text,true); PERFORM set_config('test.tc_manager',manager_a::text,true); PERFORM set_config('test.tc_other_manager',manager_b::text,true); PERFORM set_config('test.tc_learner',learner_ref::text,true); PERFORM set_config('test.tc_outsider',outsider_ref::text,true);
  PERFORM set_config('test.tc_org',org_ref::text,true); PERFORM set_config('test.tc_other_org',other_org::text,true); PERFORM set_config('test.tc_paid',paid_ref::text,true); PERFORM set_config('test.tc_free',free_ref::text,true); PERFORM set_config('test.tc_cohort',gen_random_uuid()::text,true);
END;
$fixture$;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub',current_setting('test.tc_manager'),true);
DO $manager$
DECLARE cohort_ref uuid:=current_setting('test.tc_cohort')::uuid; order_data jsonb; denied boolean:=false;
BEGIN
  IF public.has_role(auth.uid(),'admin') THEN RAISE EXCEPTION 'Fixture manager unexpectedly has platform access'; END IF;
  PERFORM public.create_organization_cohort(current_setting('test.tc_org')::uuid,cohort_ref,'Manager-created cohort');
  IF public.create_organization_cohort(current_setting('test.tc_org')::uuid,cohort_ref,'Manager-created cohort')<>cohort_ref THEN RAISE EXCEPTION 'Cohort creation retry changed cohort'; END IF;
  PERFORM public.save_organization_cohort(cohort_ref,'Manager training cohort',1,true,0);
  PERFORM public.set_organization_cohort_member(cohort_ref,current_setting('test.tc_learner')::uuid,true);
  PERFORM public.set_organization_cohort_course(cohort_ref,current_setting('test.tc_free')::uuid,true,NULL);
  PERFORM public.set_organization_cohort_course(cohort_ref,current_setting('test.tc_paid')::uuid,true,clock_timestamp()+interval '7 days');
  IF NOT public.cohort_report_access(cohort_ref) OR (SELECT count(*) FROM public.organization_cohort_people(cohort_ref))<>1 THEN RAISE EXCEPTION 'Organization manager cannot manage/report their cohort'; END IF;
  BEGIN PERFORM public.set_organization_cohort_member(cohort_ref,current_setting('test.tc_other_manager')::uuid,true); EXCEPTION WHEN raise_exception THEN denied:=true; END;
  IF NOT denied THEN RAISE EXCEPTION 'Organization cohort seat cap bypassed'; END IF;
  denied:=false; BEGIN PERFORM public.set_organization_cohort_member(cohort_ref,current_setting('test.tc_outsider')::uuid,true); EXCEPTION WHEN raise_exception THEN denied:=true; END;
  IF NOT denied THEN RAISE EXCEPTION 'Cross-tenant cohort addition allowed'; END IF;
  order_data:=public.create_course_license_order(cohort_ref,current_setting('test.tc_paid')::uuid,1,gen_random_uuid());
  IF order_data->>'buyer_id'<>auth.uid()::text OR public.cohort_billing_destination(cohort_ref)<>current_setting('test.tc_org')::uuid THEN RAISE EXCEPTION 'Tenant buyer or checkout destination incorrect'; END IF;
  PERFORM set_config('test.tc_order',order_data::text,true);
END;
$manager$;
RESET ROLE;
DO $auto_free$
BEGIN
  IF NOT EXISTS(SELECT 1 FROM public.course_enrollments WHERE user_id=current_setting('test.tc_learner')::uuid AND course_id=current_setting('test.tc_free')::uuid AND payment_status='free') THEN RAISE EXCEPTION 'Tenant auto-enrolment failed'; END IF;
END;
$auto_free$;
SET LOCAL ROLE service_role;
DO $fund$
DECLARE order_data jsonb:=current_setting('test.tc_order')::jsonb; session_ref text:='cs_tenant_'||gen_random_uuid();
BEGIN
  PERFORM public.bind_course_license_checkout((order_data->>'id')::uuid,session_ref,'https://checkout.stripe.com/fixture');
  PERFORM public.apply_cohort_license_payment(jsonb_build_object('id','evt_tenant_'||gen_random_uuid(),'type','test.payment','created',100,'action','paid','session',jsonb_build_object('id',session_ref,'created',90,'mode','payment','payment_status','paid','amount_total',2000,'currency','usd','metadata',jsonb_build_object('purchase_kind','cohort_license','license_order_id',order_data->>'id','course_id',order_data->>'course_id','cohort_id',order_data->>'cohort_id','user_id',order_data->>'buyer_id','quantity','1','price_cents','2000'))));
END;
$fund$;
RESET ROLE;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub',current_setting('test.tc_manager'),true);
DO $allocate$
DECLARE order_ref uuid:=(current_setting('test.tc_order')::jsonb->>'id')::uuid;
BEGIN
  IF public.allocate_course_licenses(order_ref,ARRAY[current_setting('test.tc_learner')::uuid])<>1 THEN RAISE EXCEPTION 'Tenant buyer cannot allocate funded licence'; END IF;
  IF (public.course_license_order_report(order_ref)->>'used')::integer<>1 THEN RAISE EXCEPTION 'Tenant licence report incorrect'; END IF;
END;
$allocate$;
SELECT set_config('request.jwt.claim.sub',current_setting('test.tc_other_manager'),true);
DO $peer_manager$
DECLARE denied boolean:=false;
BEGIN
  IF NOT public.cohort_report_access(current_setting('test.tc_cohort')::uuid) OR NOT EXISTS(SELECT 1 FROM public.organization_training_cohorts(current_setting('test.tc_org')::uuid)) THEN RAISE EXCEPTION 'Other manager in same tenant cannot report'; END IF;
  BEGIN PERFORM public.course_license_order_report((current_setting('test.tc_order')::jsonb->>'id')::uuid); EXCEPTION WHEN raise_exception THEN denied:=true; END;
  IF NOT denied THEN RAISE EXCEPTION 'Nonbuyer organization manager can export paid licence inventory'; END IF;
END;
$peer_manager$;
SELECT set_config('request.jwt.claim.sub',current_setting('test.tc_outsider'),true);
DO $outsider$
DECLARE denied boolean:=false;
BEGIN
  IF EXISTS(SELECT 1 FROM public.organization_training_cohorts(current_setting('test.tc_org')::uuid)) OR public.organization_learning_summary(current_setting('test.tc_org')::uuid) IS NOT NULL THEN RAISE EXCEPTION 'Tenant training report leaked across organizations'; END IF;
  BEGIN PERFORM public.set_organization_cohort_course(current_setting('test.tc_cohort')::uuid,current_setting('test.tc_free')::uuid,false,NULL); EXCEPTION WHEN raise_exception THEN denied:=true; END;
  IF NOT denied THEN RAISE EXCEPTION 'Other tenant manager edited course assignments'; END IF;
END;
$outsider$;
SELECT set_config('request.jwt.claim.sub',current_setting('test.tc_owner'),true);
SELECT public.set_organization_member(current_setting('test.tc_org')::uuid,'cohort-manager-a-'||current_setting('test.tc_manager')||'@example.invalid','learner',NULL,NULL,'Former manager',1);
SELECT set_config('request.jwt.claim.sub',current_setting('test.tc_manager'),true);
DO $demoted$
DECLARE denied boolean:=false; changed integer;
BEGIN
  IF public.cohort_report_access(current_setting('test.tc_cohort')::uuid) OR EXISTS(SELECT 1 FROM public.cohorts WHERE id=current_setting('test.tc_cohort')::uuid) OR EXISTS(SELECT 1 FROM public.cohort_members WHERE cohort_id=current_setting('test.tc_cohort')::uuid) THEN RAISE EXCEPTION 'Demoted cohort owner retains management roster or reports'; END IF;
  UPDATE public.cohorts SET name='Unauthorized old-owner update' WHERE id=current_setting('test.tc_cohort')::uuid; GET DIAGNOSTICS changed=ROW_COUNT;
  IF changed<>0 THEN RAISE EXCEPTION 'Legacy owner write bypassed organization management role'; END IF;
  BEGIN PERFORM public.create_course_license_order(current_setting('test.tc_cohort')::uuid,current_setting('test.tc_paid')::uuid,1,gen_random_uuid()); EXCEPTION WHEN raise_exception THEN denied:=true; END;
  IF NOT denied THEN RAISE EXCEPTION 'Demoted buyer can start another paid order'; END IF;
END;
$demoted$;
SELECT set_config('request.jwt.claim.sub',current_setting('test.tc_learner'),true);
DO $learner$
DECLARE denied boolean:=false;
BEGIN
  IF NOT public.studio_course_visible(current_setting('test.tc_paid')::uuid) THEN RAISE EXCEPTION 'Buyer role change revoked a funded learner licence'; END IF;
  BEGIN PERFORM public.create_organization_cohort(current_setting('test.tc_org')::uuid,gen_random_uuid(),'Unauthorized learner cohort'); EXCEPTION WHEN raise_exception THEN denied:=true; END;
  IF NOT denied THEN RAISE EXCEPTION 'Ordinary learner manages tenant cohorts'; END IF;
END;
$learner$;
RESET ROLE;
ROLLBACK;
