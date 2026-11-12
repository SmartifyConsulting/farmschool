BEGIN;

DO $fixture$
DECLARE owner_ref uuid; course_ref uuid; learner_ref uuid:=gen_random_uuid();
BEGIN
  SELECT user_id INTO owner_ref FROM public.user_roles WHERE role='admin' LIMIT 1;
  IF owner_ref IS NULL THEN RAISE EXCEPTION 'Fixture owner required'; END IF;
  INSERT INTO public.studio_courses(author_id,title,description) VALUES(owner_ref,'Rollback-only rubric verification','Temporary rubric test') RETURNING id INTO course_ref;
  INSERT INTO public.course_enrollments(user_id,course_id,payment_status) VALUES(learner_ref,course_ref,'free');
  PERFORM set_config('test.rubric_owner',owner_ref::text,true);
  PERFORM set_config('test.rubric_learner',learner_ref::text,true);
  PERFORM set_config('test.rubric_course',course_ref::text,true);
END;
$fixture$;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub',current_setting('test.rubric_owner'),true);
DO $trainer$
DECLARE competency_ref uuid; evidence_ref uuid; criteria jsonb; marks jsonb; denied boolean; snapshot jsonb;
BEGIN
  competency_ref:=public.add_course_competency(current_setting('test.rubric_course')::uuid,'SAFE-01','Safe technique','Trainer assessment');
  PERFORM set_config('test.rubric_competency',competency_ref::text,true);
  criteria:='[{"id":"10000000-0000-4000-8000-000000000001","title":"Safety technique","description":"","maxPoints":30},{"id":"10000000-0000-4000-8000-000000000002","title":"Execution quality","description":"","maxPoints":70}]';
  marks:='{"10000000-0000-4000-8000-000000000001":30,"10000000-0000-4000-8000-000000000002":35}';
  IF public.save_competency_rubric(competency_ref,criteria,80,0)<>1 THEN RAISE EXCEPTION 'Rubric version failed'; END IF;
  evidence_ref:=public.assess_competency_rubric(competency_ref,current_setting('test.rubric_learner')::uuid,marks,'Observed technique and practical execution.',1);
  PERFORM set_config('test.rubric_evidence',evidence_ref::text,true);
  IF NOT EXISTS(SELECT 1 FROM public.learner_competency_evidence WHERE id=evidence_ref AND score=65 AND NOT achieved AND source_type='rubric') THEN RAISE EXCEPTION 'Weighted scoring failed'; END IF;
  denied:=false;
  BEGIN
    PERFORM public.assess_competency_rubric(competency_ref,current_setting('test.rubric_learner')::uuid,'{"10000000-0000-4000-8000-000000000001":30}','Missing criterion must be rejected.',1);
  EXCEPTION WHEN raise_exception THEN denied:=true;
  END;
  IF NOT denied THEN RAISE EXCEPTION 'Missing criterion accepted'; END IF;
  denied:=false;
  BEGIN
    PERFORM public.assess_competency_rubric(competency_ref,current_setting('test.rubric_learner')::uuid,marks || '{"10000000-0000-4000-8000-000000000002":71}','Over-maximum score must be rejected.',1);
  EXCEPTION WHEN raise_exception THEN denied:=true;
  END;
  IF NOT denied THEN RAISE EXCEPTION 'Over-maximum score accepted'; END IF;
  PERFORM public.save_competency_rubric(competency_ref,jsonb_set(criteria,'{0,title}','"Updated safety criterion"'),60,1);
  SELECT criteria_snapshot INTO snapshot FROM public.competency_rubric_assessments WHERE evidence_id=evidence_ref;
  IF snapshot->0->>'title'<>'Safety technique' OR NOT EXISTS(SELECT 1 FROM public.competency_rubric_assessments WHERE evidence_id=evidence_ref AND pass_mark=80 AND rubric_version=1 AND total_points=65 AND max_points=100) THEN RAISE EXCEPTION 'Historical rubric changed'; END IF;
  denied:=false;
  BEGIN
    PERFORM public.assess_competency_rubric(competency_ref,current_setting('test.rubric_learner')::uuid,marks,'Stale rubric must be rejected.',1);
  EXCEPTION WHEN raise_exception THEN denied:=true;
  END;
  IF NOT denied THEN RAISE EXCEPTION 'Stale grading accepted'; END IF;
  denied:=false;
  BEGIN
    PERFORM public.save_competency_rubric(competency_ref,criteria,80,1);
  EXCEPTION WHEN raise_exception THEN denied:=true;
  END;
  IF NOT denied THEN RAISE EXCEPTION 'Stale save accepted'; END IF;
  PERFORM public.save_competency_rubric(competency_ref,'[{"id":"10000000-0000-4000-8000-000000000001","title":"Boundary technique","description":"","maxPoints":3}]',66.67,2);
  evidence_ref:=public.assess_competency_rubric(competency_ref,current_setting('test.rubric_learner')::uuid,'{"10000000-0000-4000-8000-000000000001":2}','Verify rounding at the displayed pass threshold.',3);
  IF NOT EXISTS(SELECT 1 FROM public.learner_competency_evidence WHERE id=evidence_ref AND score=66.67 AND achieved) THEN RAISE EXCEPTION 'Pass boundary differs from preview'; END IF;
END;
$trainer$;
SELECT set_config('request.jwt.claim.sub',current_setting('test.rubric_learner'),true);
DO $learner$
DECLARE denied boolean:=false;
BEGIN
  IF NOT EXISTS(SELECT 1 FROM public.competency_rubric_assessments WHERE evidence_id=current_setting('test.rubric_evidence')::uuid) THEN RAISE EXCEPTION 'Learner cannot read own rubric'; END IF;
  BEGIN
    PERFORM public.assess_competency_rubric(current_setting('test.rubric_competency')::uuid,auth.uid(),'{}','Learners must never grade themselves.',3);
  EXCEPTION WHEN raise_exception THEN denied:=true;
  END;
  IF NOT denied THEN RAISE EXCEPTION 'Self-grading allowed'; END IF;
  IF has_table_privilege('authenticated','public.competency_rubric_assessments','INSERT') OR has_table_privilege('authenticated','public.competency_rubric_assessments','UPDATE') THEN RAISE EXCEPTION 'Snapshot forgery privileges remain'; END IF;
END;
$learner$;
SELECT set_config('request.jwt.claim.sub',gen_random_uuid()::text,true);
DO $outsider$
BEGIN
  IF EXISTS(SELECT 1 FROM public.competency_rubric_assessments WHERE evidence_id=current_setting('test.rubric_evidence')::uuid) THEN RAISE EXCEPTION 'Unrelated user can read rubric snapshot'; END IF;
END;
$outsider$;
RESET ROLE;

ROLLBACK;
