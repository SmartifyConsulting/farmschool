BEGIN;
DO $fixture$
DECLARE owner_ref uuid; learner_ref uuid:=gen_random_uuid(); cohort_ref uuid; course_ref uuid;
BEGIN
  SELECT user_id INTO owner_ref FROM public.user_roles WHERE role='admin' LIMIT 1;
  IF owner_ref IS NULL THEN RAISE EXCEPTION 'Fixture owner required'; END IF;
  INSERT INTO auth.users(id,aud,role,email,email_confirmed_at,created_at,updated_at) VALUES(learner_ref,'authenticated','authenticated','reminder-fixture-'||learner_ref||'@example.invalid',now(),now(),now());
  PERFORM set_config('request.jwt.claim.sub',owner_ref::text,true);
  INSERT INTO public.studio_courses(author_id,title,description) VALUES(owner_ref,'Rollback-only reminder fixture','Verified reminder delivery tests without sending any emails.') RETURNING id INTO course_ref;
  INSERT INTO public.studio_lessons(course_id,title,kind,body) VALUES(course_ref,'Reading','reading','Review the course notes.');
  PERFORM public.studio_approve_review(course_ref); PERFORM public.studio_publish_version(course_ref,'Rollback-only reminder test');
  INSERT INTO public.cohorts(name,owner_id,reminders_enabled) VALUES('Reminder test group',owner_ref,true) RETURNING id INTO cohort_ref;
  INSERT INTO public.cohort_members(cohort_id,user_id) VALUES(cohort_ref,learner_ref);
  INSERT INTO public.cohort_course_assignments(cohort_id,course_id) VALUES(cohort_ref,course_ref);
  PERFORM set_config('test.reminder_owner',owner_ref::text,true); PERFORM set_config('test.reminder_learner',learner_ref::text,true); PERFORM set_config('test.reminder_cohort',cohort_ref::text,true); PERFORM set_config('test.reminder_course',course_ref::text,true);
END;
$fixture$;
SET LOCAL ROLE service_role;
DO $queue$
DECLARE jobs jsonb;
BEGIN
  IF public.enqueue_cohort_reminders(current_setting('test.reminder_cohort')::uuid)<>1 THEN RAISE EXCEPTION 'Initial reminder missing'; END IF;
  IF public.enqueue_cohort_reminders(current_setting('test.reminder_cohort')::uuid)<>0 THEN RAISE EXCEPTION 'Duplicate reminder queued'; END IF;
  jobs:=public.claim_cohort_reminders(10,current_setting('test.reminder_cohort')::uuid);
  IF jsonb_array_length(jobs)<>1 THEN RAISE EXCEPTION 'Queue claim incorrect'; END IF;
  PERFORM set_config('test.reminder_id',jobs->0->>'id',true); PERFORM set_config('test.reminder_lease',jobs->0->>'lease',true);
  IF jsonb_array_length(public.claim_cohort_reminders(10,current_setting('test.reminder_cohort')::uuid))<>0 THEN RAISE EXCEPTION 'Active lease claimed twice'; END IF;
END;
$queue$;
RESET ROLE;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub',current_setting('test.reminder_learner'),true);
INSERT INTO public.cohort_email_preferences(user_id,enabled) VALUES(auth.uid(),false);
DO $security$
DECLARE denied boolean:=false;
BEGIN
  BEGIN PERFORM public.claim_cohort_reminders(10,NULL); EXCEPTION WHEN insufficient_privilege THEN denied:=true; END;
  IF NOT denied THEN RAISE EXCEPTION 'Learner can claim private email jobs'; END IF;
  IF has_table_privilege('authenticated','public.cohort_reminder_outbox','SELECT') THEN RAISE EXCEPTION 'Learner can read email recipients'; END IF;
END;
$security$;
RESET ROLE;
SET LOCAL ROLE service_role;
DO $$ BEGIN IF public.authorize_cohort_reminder(current_setting('test.reminder_id')::uuid,current_setting('test.reminder_lease')::uuid) THEN RAISE EXCEPTION 'Opt-out not applied before sending'; END IF; END; $$;
RESET ROLE;
UPDATE public.cohort_email_preferences SET enabled=true WHERE user_id=current_setting('test.reminder_learner')::uuid;
UPDATE public.cohort_course_assignments SET due_at=now()+interval '3 days' WHERE cohort_id=current_setting('test.reminder_cohort')::uuid;
SET LOCAL ROLE service_role;
DO $send_ack$
DECLARE jobs jsonb; denied boolean:=false;
BEGIN
  IF public.enqueue_cohort_reminders(current_setting('test.reminder_cohort')::uuid)<>1 THEN RAISE EXCEPTION 'New deadline stage not queued'; END IF;
  jobs:=public.claim_cohort_reminders(10,current_setting('test.reminder_cohort')::uuid);
  PERFORM set_config('test.reminder_id',jobs->0->>'id',true); PERFORM set_config('test.reminder_lease',jobs->0->>'lease',true);
  IF NOT public.authorize_cohort_reminder(current_setting('test.reminder_id')::uuid,current_setting('test.reminder_lease')::uuid) THEN RAISE EXCEPTION 'Eligible job denied'; END IF;
  PERFORM public.finish_cohort_reminder(current_setting('test.reminder_id')::uuid,current_setting('test.reminder_lease')::uuid,'rollback-only-provider-confirmation',NULL);
  BEGIN PERFORM public.finish_cohort_reminder(current_setting('test.reminder_id')::uuid,current_setting('test.reminder_lease')::uuid,'duplicate-confirmation',NULL); EXCEPTION WHEN raise_exception THEN denied:=true; END;
  IF NOT denied THEN RAISE EXCEPTION 'Completed lease acknowledged twice'; END IF;
END;
$send_ack$;
SET LOCAL TIME ZONE 'Africa/Johannesburg';
DO $$ BEGIN IF public.enqueue_cohort_reminders(current_setting('test.reminder_cohort')::uuid)<>0 THEN RAISE EXCEPTION 'Timezone change duplicated reminder'; END IF; END; $$;
RESET ROLE;
UPDATE public.cohort_course_assignments SET due_at=now()-interval '1 day' WHERE cohort_id=current_setting('test.reminder_cohort')::uuid;
SET LOCAL ROLE service_role;
DO $retry$
DECLARE jobs jsonb;
BEGIN
  PERFORM public.enqueue_cohort_reminders(current_setting('test.reminder_cohort')::uuid);
  jobs:=public.claim_cohort_reminders(10,current_setting('test.reminder_cohort')::uuid);
  PERFORM set_config('test.reminder_id',jobs->0->>'id',true); PERFORM set_config('test.reminder_lease',jobs->0->>'lease',true); PERFORM set_config('test.reminder_payload',(jobs->0->'payload')::text,true);
  PERFORM public.finish_cohort_reminder(current_setting('test.reminder_id')::uuid,current_setting('test.reminder_lease')::uuid,NULL,'provider_unconfirmed');
END;
$retry$;
RESET ROLE;
UPDATE public.cohort_reminder_outbox SET not_before=now()-interval '1 minute' WHERE id=current_setting('test.reminder_id')::uuid;
SET LOCAL ROLE service_role;
DO $retry_claim$
DECLARE jobs jsonb; denied boolean:=false;
BEGIN
  jobs:=public.claim_cohort_reminders(10,current_setting('test.reminder_cohort')::uuid);
  IF jobs->0->'payload' IS DISTINCT FROM current_setting('test.reminder_payload')::jsonb OR jobs->0->>'lease'=current_setting('test.reminder_lease') THEN RAISE EXCEPTION 'Retry changed payload or reused lease'; END IF;
  BEGIN PERFORM public.finish_cohort_reminder(current_setting('test.reminder_id')::uuid,current_setting('test.reminder_lease')::uuid,'old-lease',NULL); EXCEPTION WHEN raise_exception THEN denied:=true; END;
  IF NOT denied THEN RAISE EXCEPTION 'Old worker can acknowledge replacement lease'; END IF;
  PERFORM set_config('test.reminder_lease',jobs->0->>'lease',true);
END;
$retry_claim$;
RESET ROLE;
UPDATE auth.users SET email='changed-reminder-fixture@example.invalid' WHERE id=current_setting('test.reminder_learner')::uuid;
SET LOCAL ROLE service_role;
DO $$ BEGIN IF public.authorize_cohort_reminder(current_setting('test.reminder_id')::uuid,current_setting('test.reminder_lease')::uuid) THEN RAISE EXCEPTION 'Queued message still targets old email address'; END IF; END; $$;
RESET ROLE;
DO $results$
BEGIN
  IF (SELECT count(*) FROM public.cohort_reminder_outbox WHERE cohort_id=current_setting('test.reminder_cohort')::uuid AND status='sent')<>1 THEN RAISE EXCEPTION 'Provider acknowledgement not retained'; END IF;
  IF (SELECT count(*) FROM public.cohort_reminder_outbox WHERE cohort_id=current_setting('test.reminder_cohort')::uuid AND status='cancelled')<>2 THEN RAISE EXCEPTION 'Stale jobs not cancelled'; END IF;
END;
$results$;
ROLLBACK;
