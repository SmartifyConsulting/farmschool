BEGIN;

DO $fixture$
DECLARE owner_ref uuid; course_ref uuid; cohort_ref uuid; learner_ref uuid := gen_random_uuid();
BEGIN
  SELECT user_id INTO owner_ref FROM public.user_roles WHERE role='admin' LIMIT 1;
  IF owner_ref IS NULL THEN RAISE EXCEPTION 'Fixture owner required'; END IF;
  INSERT INTO public.studio_courses(author_id,title,description) VALUES(owner_ref,'Rollback-only competency course','Temporary assessment test') RETURNING id INTO course_ref;
  INSERT INTO public.cohorts(name,owner_id) VALUES('Rollback-only assessment group',owner_ref) RETURNING id INTO cohort_ref;
  INSERT INTO public.cohort_members(cohort_id,user_id) VALUES(cohort_ref,learner_ref);
  INSERT INTO public.cohort_course_assignments(cohort_id,course_id) VALUES(cohort_ref,course_ref);
  PERFORM set_config('test.assessment_owner',owner_ref::text,true);
  PERFORM set_config('test.assessment_learner',learner_ref::text,true);
  PERFORM set_config('test.assessment_course',course_ref::text,true);
END;
$fixture$;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub',current_setting('test.assessment_owner'),true);
DO $trainer$
DECLARE competency_ref uuid; evidence_ref uuid; denied boolean := false;
BEGIN
  competency_ref := public.add_course_competency(current_setting('test.assessment_course')::uuid,'SAFE-01','Safe practical technique','Demonstrates safe technique');
  PERFORM set_config('test.assessment_competency',competency_ref::text,true);
  IF NOT EXISTS(SELECT 1 FROM public.course_assessment_learners(current_setting('test.assessment_course')::uuid) WHERE user_id=current_setting('test.assessment_learner')::uuid) THEN RAISE EXCEPTION 'Assigned learner not available'; END IF;
  evidence_ref := public.record_competency_assessment(competency_ref,current_setting('test.assessment_learner')::uuid,false,40,'Observed task needs further practice.');
  PERFORM public.record_competency_assessment(competency_ref,current_setting('test.assessment_learner')::uuid,true,90,'Observed safe technique on reassessment.');
  IF (SELECT count(*) FROM public.learner_competency_evidence WHERE competency_id=competency_ref) <> 2 THEN RAISE EXCEPTION 'Assessment history was overwritten'; END IF;
  IF EXISTS(SELECT 1 FROM public.learner_competency_evidence WHERE competency_id=competency_ref AND assessed_by<>auth.uid()) THEN RAISE EXCEPTION 'Assessor identity incorrect'; END IF;
  BEGIN
    PERFORM public.record_competency_assessment(competency_ref,current_setting('test.assessment_learner')::uuid,true,101,'Invalid score should be rejected.');
  EXCEPTION WHEN raise_exception THEN denied := true;
  END;
  IF NOT denied THEN RAISE EXCEPTION 'Invalid score accepted'; END IF;
END;
$trainer$;
SELECT set_config('request.jwt.claim.sub',current_setting('test.assessment_learner'),true);
DO $learner$
DECLARE denied boolean := false;
BEGIN
  IF (SELECT count(*) FROM public.learner_competency_evidence WHERE competency_id=current_setting('test.assessment_competency')::uuid) <> 2 THEN RAISE EXCEPTION 'Learner cannot read own assessment'; END IF;
  BEGIN
    PERFORM public.record_competency_assessment(current_setting('test.assessment_competency')::uuid,auth.uid(),true,100,'Self-grading must never be allowed.');
  EXCEPTION WHEN raise_exception THEN denied := true;
  END;
  IF NOT denied THEN RAISE EXCEPTION 'Self-grading unexpectedly allowed'; END IF;
  IF has_table_privilege('authenticated','public.learner_competency_evidence','INSERT') OR has_table_privilege('authenticated','public.learner_competency_evidence','UPDATE') THEN RAISE EXCEPTION 'Direct grading privileges remain'; END IF;
END;
$learner$;
SELECT set_config('request.jwt.claim.sub',gen_random_uuid()::text,true);
DO $outsider$
DECLARE denied boolean := false;
BEGIN
  IF EXISTS(SELECT 1 FROM public.learner_competency_evidence WHERE competency_id=current_setting('test.assessment_competency')::uuid) THEN RAISE EXCEPTION 'Unrelated user can read assessment'; END IF;
  BEGIN
    PERFORM public.course_assessment_learners(current_setting('test.assessment_course')::uuid);
  EXCEPTION WHEN raise_exception THEN denied := true;
  END;
  IF NOT denied THEN RAISE EXCEPTION 'Unrelated user can list learners'; END IF;
END;
$outsider$;
RESET ROLE;

UPDATE public.studio_courses SET price_cents=2000 WHERE id=current_setting('test.assessment_course')::uuid;
INSERT INTO public.course_enrollments(user_id,course_id,payment_status)
VALUES(current_setting('test.assessment_learner')::uuid,current_setting('test.assessment_course')::uuid,'refunded');
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub',current_setting('test.assessment_owner'),true);
DO $revoked$
DECLARE denied boolean := false;
BEGIN
  IF EXISTS(SELECT 1 FROM public.course_assessment_learners(current_setting('test.assessment_course')::uuid)) THEN RAISE EXCEPTION 'Refunded learner remains eligible'; END IF;
  BEGIN
    PERFORM public.record_competency_assessment(current_setting('test.assessment_competency')::uuid,current_setting('test.assessment_learner')::uuid,true,90,'Revoked payment must prevent assessment.');
  EXCEPTION WHEN raise_exception THEN denied := true;
  END;
  IF NOT denied THEN RAISE EXCEPTION 'Refunded learner was assessed'; END IF;
END;
$revoked$;
RESET ROLE;

ROLLBACK;
