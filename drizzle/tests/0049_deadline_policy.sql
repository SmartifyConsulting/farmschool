BEGIN;

DO $fixture$
DECLARE owner_ref uuid; course_ref uuid; competency_ref uuid; cohort_ref uuid; future_cohort uuid; learner_ref uuid:=gen_random_uuid();
BEGIN
  SELECT user_id INTO owner_ref FROM public.user_roles WHERE role='admin' LIMIT 1;
  IF owner_ref IS NULL THEN RAISE EXCEPTION 'Fixture owner required'; END IF;
  PERFORM set_config('request.jwt.claim.sub',owner_ref::text,true);
  INSERT INTO public.studio_courses(author_id,title,description) VALUES(owner_ref,'Rollback-only deadline verification','Verified course for transactional deadline policy checks.') RETURNING id INTO course_ref;
  INSERT INTO public.studio_lessons(course_id,title,kind,body) VALUES(course_ref,'Technique','reading','Complete the practical exercise and document the evidence.');
  PERFORM public.studio_approve_review(course_ref);
  PERFORM public.studio_publish_version(course_ref,'Rollback-only deadline fixture');
  competency_ref:=public.add_course_competency(course_ref,'SAFE-01','Safe technique','Demonstrate and document safe practical technique.');
  PERFORM public.save_competency_rubric(competency_ref,'[{"id":"10000000-0000-4000-8000-000000000001","title":"Safe technique","description":"","maxPoints":10}]',80,0);
  PERFORM public.set_competency_late_policy(competency_ref,false,true);
  INSERT INTO public.cohorts(name,owner_id) VALUES('Rollback-only deadline group',owner_ref) RETURNING id INTO cohort_ref;
  INSERT INTO public.cohort_members(cohort_id,user_id) VALUES(cohort_ref,learner_ref);
  INSERT INTO public.cohort_course_assignments(cohort_id,course_id,due_at) VALUES(cohort_ref,course_ref,clock_timestamp()+interval '1 hour');
  INSERT INTO public.cohorts(name,owner_id) VALUES('Rollback-only later deadline group',owner_ref) RETURNING id INTO future_cohort;
  INSERT INTO public.cohort_members(cohort_id,user_id) VALUES(future_cohort,learner_ref);
  INSERT INTO public.cohort_course_assignments(cohort_id,course_id,due_at) VALUES(future_cohort,course_ref,clock_timestamp()+interval '10 days');
  PERFORM set_config('test.deadline_owner',owner_ref::text,true);
  PERFORM set_config('test.deadline_learner',learner_ref::text,true);
  PERFORM set_config('test.deadline_course',course_ref::text,true);
  PERFORM set_config('test.deadline_competency',competency_ref::text,true);
  PERFORM set_config('test.deadline_cohort',cohort_ref::text,true);
END;
$fixture$;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub',current_setting('test.deadline_learner'),true);
DO $on_time$
DECLARE work_ref uuid; denied boolean:=false; due timestamptz;
BEGIN
  due:=public.my_course_submission_deadline(current_setting('test.deadline_course')::uuid);
  IF due IS NULL OR due>clock_timestamp()+interval '2 hours' THEN RAISE EXCEPTION 'Earliest deadline was not selected'; END IF;
  work_ref:=public.submit_competency_work(current_setting('test.deadline_competency')::uuid,'This practical evidence is submitted before the course deadline.','',1);
  PERFORM set_config('test.deadline_first',work_ref::text,true);
  IF NOT EXISTS(SELECT 1 FROM public.competency_submissions WHERE id=work_ref AND NOT late AND NOT late_allowed AND due_at=due) THEN RAISE EXCEPTION 'On-time deadline snapshot incorrect'; END IF;
  BEGIN
    PERFORM public.set_competency_late_policy(current_setting('test.deadline_competency')::uuid,true,false);
  EXCEPTION WHEN raise_exception THEN denied:=true;
  END;
  IF NOT denied THEN RAISE EXCEPTION 'Learner changed late policy'; END IF;
END;
$on_time$;
SELECT set_config('request.jwt.claim.sub',current_setting('test.deadline_owner'),true);
SELECT public.assess_competency_submission(current_setting('test.deadline_first')::uuid,'{"10000000-0000-4000-8000-000000000001":8}','The practical evidence demonstrates safe technique.');
RESET ROLE;
UPDATE public.cohort_course_assignments SET due_at=clock_timestamp()-interval '1 hour' WHERE cohort_id=current_setting('test.deadline_cohort')::uuid;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub',current_setting('test.deadline_learner'),true);
DO $blocked$
DECLARE denied boolean:=false;
BEGIN
  BEGIN
    PERFORM public.submit_competency_work(current_setting('test.deadline_competency')::uuid,'This attempt after the earliest deadline must be blocked.','',1);
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM NOT LIKE 'The submission deadline has passed%' THEN RAISE; END IF;
    denied:=true;
  END;
  IF NOT denied THEN RAISE EXCEPTION 'Late attempt was accepted under blocking policy'; END IF;
END;
$blocked$;
SELECT set_config('request.jwt.claim.sub',current_setting('test.deadline_owner'),true);
SELECT public.set_competency_late_policy(current_setting('test.deadline_competency')::uuid,true,false);
SELECT set_config('request.jwt.claim.sub',current_setting('test.deadline_learner'),true);
DO $allowed$
DECLARE work_ref uuid;
BEGIN
  work_ref:=public.submit_competency_work(current_setting('test.deadline_competency')::uuid,'Late work is permitted here and must retain its original deadline.','',1);
  PERFORM set_config('test.deadline_late',work_ref::text,true);
  IF NOT EXISTS(SELECT 1 FROM public.competency_submissions WHERE id=work_ref AND attempt=2 AND late AND late_allowed AND due_at<submitted_at) THEN RAISE EXCEPTION 'Accepted late work was not labelled'; END IF;
END;
$allowed$;
RESET ROLE;
UPDATE public.cohort_course_assignments SET due_at=clock_timestamp()+interval '30 days' WHERE cohort_id=current_setting('test.deadline_cohort')::uuid;
DO $immutable$
BEGIN
  IF NOT EXISTS(SELECT 1 FROM public.competency_submissions WHERE id=current_setting('test.deadline_late')::uuid AND late AND due_at<submitted_at) THEN RAISE EXCEPTION 'Deadline edit rewrote submission history'; END IF;
END;
$immutable$;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub',current_setting('test.deadline_owner'),true);
SELECT public.set_competency_late_policy(current_setting('test.deadline_competency')::uuid,false,true);
DO $stale$
DECLARE denied boolean:=false;
BEGIN
  BEGIN
    PERFORM public.set_competency_late_policy(current_setting('test.deadline_competency')::uuid,true,true);
  EXCEPTION WHEN raise_exception THEN denied:=true;
  END;
  IF NOT denied THEN RAISE EXCEPTION 'Stale policy overwrite was accepted'; END IF;
END;
$stale$;
SELECT set_config('request.jwt.claim.sub',gen_random_uuid()::text,true);
DO $undated$
DECLARE work_ref uuid;
BEGIN
  IF public.my_course_submission_deadline(current_setting('test.deadline_course')::uuid) IS NOT NULL THEN RAISE EXCEPTION 'Another learner deadline leaked'; END IF;
  work_ref:=public.submit_competency_work(current_setting('test.deadline_competency')::uuid,'This learner has no dated cohort assignment and may submit work.','',1);
  IF NOT EXISTS(SELECT 1 FROM public.competency_submissions WHERE id=work_ref AND due_at IS NULL AND NOT late) THEN RAISE EXCEPTION 'Undated learner received a false deadline'; END IF;
END;
$undated$;
RESET ROLE;

ROLLBACK;
