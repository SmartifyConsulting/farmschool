BEGIN;
DO $fixture$
DECLARE owner_ref uuid; learner_ref uuid:=gen_random_uuid(); manager_ref uuid:=gen_random_uuid(); course_ref uuid; free_ref uuid; competency_ref uuid; cohort_ref uuid; another uuid;
BEGIN
  SELECT user_id INTO owner_ref FROM public.user_roles WHERE role='admin' LIMIT 1;
  IF owner_ref IS NULL THEN RAISE EXCEPTION 'Fixture owner required'; END IF;
  INSERT INTO auth.users(id,aud,role,email,created_at,updated_at) VALUES(manager_ref,'authenticated','authenticated','manager-fixture-'||manager_ref||'@example.invalid',now(),now());
  PERFORM set_config('request.jwt.claim.sub',owner_ref::text,true);
  INSERT INTO public.studio_courses(author_id,title,description,price_cents) VALUES(owner_ref,'Rollback-only paid extension course','Verified practical training with cohort deadlines and evidence.',2000) RETURNING id INTO course_ref;
  INSERT INTO public.studio_lessons(course_id,title,kind,body) VALUES(course_ref,'Technique','reading','Review the technique carefully.');
  PERFORM public.studio_approve_review(course_ref); PERFORM public.studio_publish_version(course_ref,'Rollback-only policies');
  INSERT INTO public.studio_courses(author_id,title,description) VALUES(owner_ref,'Rollback-only free auto enrolment','Verified free training for automatic cohort enrolment.') RETURNING id INTO free_ref;
  INSERT INTO public.studio_lessons(course_id,title,kind,body) VALUES(free_ref,'Technique','reading','Review the technique carefully.');
  PERFORM public.studio_approve_review(free_ref); PERFORM public.studio_publish_version(free_ref,'Rollback-only policies');
  competency_ref:=public.add_course_competency(course_ref,'EXT-01','Technique','Provide written evidence of the technique.');
  PERFORM public.save_competency_rubric(competency_ref,'[{"id":"10000000-0000-4000-8000-000000000001","title":"Technique","description":"","maxPoints":10}]',80,0);
  PERFORM public.set_competency_late_policy(competency_ref,false,true);
  INSERT INTO public.cohorts(name,owner_id) VALUES('Rollback-only cohort policy',owner_ref) RETURNING id INTO cohort_ref;
  INSERT INTO public.cohort_members(cohort_id,user_id) VALUES(cohort_ref,learner_ref);
  INSERT INTO public.cohort_course_assignments(cohort_id,course_id,due_at) VALUES(cohort_ref,course_ref,now()-interval '1 day'),(cohort_ref,free_ref,NULL);
  PERFORM set_config('test.policy_owner',owner_ref::text,true); PERFORM set_config('test.policy_learner',learner_ref::text,true); PERFORM set_config('test.policy_manager',manager_ref::text,true);
  PERFORM set_config('test.policy_course',course_ref::text,true); PERFORM set_config('test.policy_free',free_ref::text,true); PERFORM set_config('test.policy_competency',competency_ref::text,true); PERFORM set_config('test.policy_cohort',cohort_ref::text,true);
  INSERT INTO public.course_enrollments(user_id,course_id,payment_status,amount_cents) VALUES(learner_ref,course_ref,'paid',2000);
END;
$fixture$;
SET LOCAL ROLE authenticated;
DO $policies$
DECLARE denied boolean:=false; report jsonb;
BEGIN
  PERFORM public.save_cohort_policy(current_setting('test.policy_cohort')::uuid,1,true,true,0);
  BEGIN INSERT INTO public.cohort_members(cohort_id,user_id) VALUES(current_setting('test.policy_cohort')::uuid,gen_random_uuid()); EXCEPTION WHEN raise_exception THEN denied:=SQLERRM LIKE '%seat limit%'; END;
  IF NOT denied THEN RAISE EXCEPTION 'Seat limit not enforced'; END IF;
  denied:=false;
  BEGIN PERFORM public.save_cohort_policy(current_setting('test.policy_cohort')::uuid,2,false,false,0); EXCEPTION WHEN raise_exception THEN denied:=true; END;
  IF NOT denied THEN RAISE EXCEPTION 'Stale cohort update allowed'; END IF;
  PERFORM public.set_cohort_report_manager(current_setting('test.policy_cohort')::uuid,current_setting('test.policy_manager')::uuid,true);
  report:=public.cohort_progress_report(current_setting('test.policy_cohort')::uuid);
  IF (report->>'total')::integer<>2 THEN RAISE EXCEPTION 'Unstarted learner assignments missing'; END IF;
END;
$policies$;
RESET ROLE;
DO $enrolment$
BEGIN
  IF NOT EXISTS(SELECT 1 FROM public.course_enrollments WHERE course_id=current_setting('test.policy_free')::uuid AND user_id=current_setting('test.policy_learner')::uuid AND payment_status='free') THEN RAISE EXCEPTION 'Existing free assignment not auto enrolled'; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.course_enrollments WHERE course_id=current_setting('test.policy_course')::uuid AND payment_status='paid' AND amount_cents=2000) THEN RAISE EXCEPTION 'Auto enrolment overwrote payment'; END IF;
END;
$enrolment$;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub',current_setting('test.policy_learner'),true);
DO $blocked$
DECLARE denied boolean:=false;
BEGIN
  BEGIN PERFORM public.submit_competency_work(current_setting('test.policy_competency')::uuid,'This submission is outside the original cohort deadline.','',1); EXCEPTION WHEN raise_exception THEN denied:=SQLERRM LIKE '%deadline has passed%'; END;
  IF NOT denied THEN RAISE EXCEPTION 'Expired deadline not enforced'; END IF;
END;
$blocked$;
SELECT set_config('request.jwt.claim.sub',current_setting('test.policy_owner'),true);
SELECT public.set_learner_deadline(current_setting('test.policy_course')::uuid,current_setting('test.policy_learner')::uuid,now()+interval '2 days','Additional time approved for the individual practical assessment.',0);
SELECT set_config('request.jwt.claim.sub',current_setting('test.policy_learner'),true);
DO $extended$
DECLARE submitted uuid; due timestamptz; denied boolean:=false;
BEGIN
  due:=public.my_course_submission_deadline(current_setting('test.policy_course')::uuid);
  IF due<=now() THEN RAISE EXCEPTION 'Extension did not apply'; END IF;
  submitted:=public.submit_competency_work(current_setting('test.policy_competency')::uuid,'This submission is inside the individually extended deadline.','',1);
  IF NOT EXISTS(SELECT 1 FROM public.competency_submissions WHERE id=submitted AND due_at=due AND NOT late) THEN RAISE EXCEPTION 'Submission did not snapshot extended deadline'; END IF;
  BEGIN PERFORM public.set_learner_deadline(current_setting('test.policy_course')::uuid,auth.uid(),now()+interval '5 days','Learners must not grant extensions to themselves.',1); EXCEPTION WHEN raise_exception THEN denied:=true; END;
  IF NOT denied THEN RAISE EXCEPTION 'Learner extended own deadline'; END IF;
END;
$extended$;
SELECT set_config('request.jwt.claim.sub',current_setting('test.policy_manager'),true);
DO $manager$
DECLARE report jsonb; denied boolean:=false;
BEGIN
  report:=public.cohort_progress_export(current_setting('test.policy_cohort')::uuid);
  IF jsonb_array_length(report->'records')<>2 THEN RAISE EXCEPTION 'Appointed manager cannot export'; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.cohorts WHERE id=current_setting('test.policy_cohort')::uuid) THEN RAISE EXCEPTION 'Manager cannot discover assigned cohort'; END IF;
  BEGIN PERFORM public.save_cohort_policy(current_setting('test.policy_cohort')::uuid,10,true,true,1); EXCEPTION WHEN raise_exception THEN denied:=true; END;
  IF NOT denied THEN RAISE EXCEPTION 'Reporting manager can edit policies'; END IF;
  IF EXISTS(SELECT 1 FROM public.course_deadline_extensions WHERE course_id=current_setting('test.policy_course')::uuid) THEN RAISE EXCEPTION 'Manager can read private accommodation reasons'; END IF;
END;
$manager$;
SELECT set_config('request.jwt.claim.sub',current_setting('test.policy_owner'),true);
DO $remove$
DECLARE denied boolean:=false;
BEGIN
  BEGIN PERFORM public.set_learner_deadline(current_setting('test.policy_course')::uuid,current_setting('test.policy_learner')::uuid,now()+interval '3 days','An outdated extension version must not replace newer settings.',0); EXCEPTION WHEN raise_exception THEN denied:=true; END;
  IF NOT denied THEN RAISE EXCEPTION 'Stale extension accepted'; END IF;
  PERFORM public.set_learner_deadline(current_setting('test.policy_course')::uuid,current_setting('test.policy_learner')::uuid,NULL,'The individual extension is withdrawn with documented justification.',1);
  PERFORM public.set_cohort_report_manager(current_setting('test.policy_cohort')::uuid,current_setting('test.policy_manager')::uuid,false);
END;
$remove$;
SELECT set_config('request.jwt.claim.sub',current_setting('test.policy_manager'),true);
DO $revoked_manager$
DECLARE denied boolean:=false;
BEGIN
  BEGIN PERFORM public.cohort_progress_report(current_setting('test.policy_cohort')::uuid); EXCEPTION WHEN raise_exception THEN denied:=true; END;
  IF NOT denied THEN RAISE EXCEPTION 'Revoked manager can still read report'; END IF;
END;
$revoked_manager$;
SELECT set_config('request.jwt.claim.sub',current_setting('test.policy_learner'),true);
DO $$ BEGIN IF public.my_course_submission_deadline(current_setting('test.policy_course')::uuid)>=now() THEN RAISE EXCEPTION 'Removing extension did not restore cohort deadline'; END IF; END; $$;
RESET ROLE;
ROLLBACK;
