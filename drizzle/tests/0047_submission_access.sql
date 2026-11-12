BEGIN;

DO $fixture$
DECLARE owner_ref uuid; course_ref uuid; competency_ref uuid;
BEGIN
  SELECT user_id INTO owner_ref FROM public.user_roles WHERE role='admin' LIMIT 1;
  IF owner_ref IS NULL THEN RAISE EXCEPTION 'Fixture owner required'; END IF;
  PERFORM set_config('request.jwt.claim.sub',owner_ref::text,true);
  INSERT INTO public.studio_courses(author_id,title,description,price_cents) VALUES(owner_ref,'Rollback-only submission verification','Verified practical training with supporting evidence for learner assessment.',2000) RETURNING id INTO course_ref;
  INSERT INTO public.studio_lessons(course_id,title,kind,body) VALUES(course_ref,'Practical technique','reading','Review the practical technique and complete the task.');
  PERFORM public.studio_approve_review(course_ref);
  PERFORM public.studio_publish_version(course_ref,'Rollback-only submission test');
  competency_ref:=public.add_course_competency(course_ref,'SAFE-01','Practical technique','Explain the task, observations and supporting evidence.');
  PERFORM public.save_competency_rubric(competency_ref,'[{"id":"10000000-0000-4000-8000-000000000001","title":"Practical technique","description":"","maxPoints":10}]',80,0);
  PERFORM set_config('test.work_owner',owner_ref::text,true);
  PERFORM set_config('test.work_course',course_ref::text,true);
  PERFORM set_config('test.work_competency',competency_ref::text,true);
  PERFORM set_config('test.work_learner',gen_random_uuid()::text,true);
  INSERT INTO public.course_enrollments(user_id,course_id,payment_status,amount_cents) VALUES(current_setting('test.work_learner')::uuid,course_ref,'paid',2000);
END;
$fixture$;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub',current_setting('test.work_learner'),true);
DO $learner$
DECLARE submission_ref uuid; denied boolean:=false;
BEGIN
  submission_ref:=public.submit_competency_work(current_setting('test.work_competency')::uuid,'I performed the practical technique and documented the observations.','https://example.com/evidence',1);
  PERFORM set_config('test.work_submission',submission_ref::text,true);
  IF NOT EXISTS(SELECT 1 FROM public.competency_submissions WHERE id=submission_ref AND attempt=1 AND rubric_version=1 AND assessment_id IS NULL) THEN RAISE EXCEPTION 'Submission was not saved'; END IF;
  BEGIN
    PERFORM public.submit_competency_work(current_setting('test.work_competency')::uuid,'A second pending attempt must not be accepted.','',1);
  EXCEPTION WHEN raise_exception THEN denied:=true;
  END;
  IF NOT denied THEN RAISE EXCEPTION 'Multiple pending attempts accepted'; END IF;
  denied:=false;
  BEGIN
    PERFORM public.assess_competency_submission(submission_ref,'{"10000000-0000-4000-8000-000000000001":10}','Self-grading must never be accepted.');
  EXCEPTION WHEN raise_exception THEN denied:=true;
  END;
  IF NOT denied THEN RAISE EXCEPTION 'Self-grading allowed'; END IF;
END;
$learner$;
SELECT set_config('request.jwt.claim.sub',gen_random_uuid()::text,true);
DO $outsider$
BEGIN
  IF EXISTS(SELECT 1 FROM public.competency_submissions WHERE id=current_setting('test.work_submission')::uuid) THEN RAISE EXCEPTION 'Unrelated learner can read submitted work'; END IF;
END;
$outsider$;
SELECT set_config('request.jwt.claim.sub',current_setting('test.work_owner'),true);
DO $trainer$
DECLARE evidence_ref uuid; denied boolean:=false;
BEGIN
  IF NOT EXISTS(SELECT 1 FROM public.competency_submissions WHERE id=current_setting('test.work_submission')::uuid) THEN RAISE EXCEPTION 'Trainer cannot read work'; END IF;
  PERFORM public.save_competency_rubric(current_setting('test.work_competency')::uuid,'[{"id":"10000000-0000-4000-8000-000000000001","title":"Changed criterion","description":"","maxPoints":1000}]',99,1);
  evidence_ref:=public.assess_competency_submission(current_setting('test.work_submission')::uuid,'{"10000000-0000-4000-8000-000000000001":8}','The submitted work demonstrated the practical technique.');
  IF NOT EXISTS(SELECT 1 FROM public.learner_competency_evidence WHERE id=evidence_ref AND score=80 AND achieved AND source_type='submission') THEN RAISE EXCEPTION 'Wrong rubric used for assessment'; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.competency_rubric_assessments WHERE evidence_id=evidence_ref AND max_points=10 AND pass_mark=80 AND rubric_version=1) THEN RAISE EXCEPTION 'Original rubric snapshot was lost'; END IF;
  BEGIN
    PERFORM public.assess_competency_submission(current_setting('test.work_submission')::uuid,'{"10000000-0000-4000-8000-000000000001":1}','Graded submissions must not be overwritten.');
  EXCEPTION WHEN raise_exception THEN denied:=true;
  END;
  IF NOT denied THEN RAISE EXCEPTION 'Graded work was overwritten'; END IF;
END;
$trainer$;
SELECT set_config('request.jwt.claim.sub',current_setting('test.work_learner'),true);
DO $resubmit$
DECLARE second_ref uuid;
BEGIN
  IF NOT EXISTS(SELECT 1 FROM public.competency_submissions WHERE id=current_setting('test.work_submission')::uuid AND assessment_id IS NOT NULL) THEN RAISE EXCEPTION 'Learner cannot see assessment'; END IF;
  second_ref:=public.submit_competency_work(current_setting('test.work_competency')::uuid,'This second attempt incorporates the trainer feedback and new evidence.','',2);
  IF NOT EXISTS(SELECT 1 FROM public.competency_submissions WHERE id=second_ref AND attempt=2 AND rubric_version=2) THEN RAISE EXCEPTION 'Resubmission history failed'; END IF;
  IF has_table_privilege('authenticated','public.competency_submissions','INSERT') OR has_table_privilege('authenticated','public.competency_submissions','UPDATE') OR has_table_privilege('authenticated','public.competency_submissions','DELETE') THEN RAISE EXCEPTION 'Clients can forge or rewrite submission records'; END IF;
END;
$resubmit$;
RESET ROLE;
UPDATE public.course_enrollments SET payment_status='refunded' WHERE user_id=current_setting('test.work_learner')::uuid AND course_id=current_setting('test.work_course')::uuid;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub',current_setting('test.work_learner'),true);
DO $revoked$
DECLARE denied boolean:=false;
BEGIN
  BEGIN
    PERFORM public.submit_competency_work(current_setting('test.work_competency')::uuid,'Refunded learners must not submit more paid course work.','',2);
  EXCEPTION WHEN raise_exception THEN denied:=true;
  END;
  IF NOT denied THEN RAISE EXCEPTION 'Refunded learner could submit paid work'; END IF;
END;
$revoked$;
RESET ROLE;

ROLLBACK;
