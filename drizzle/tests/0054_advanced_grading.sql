BEGIN;
DO $fixture$
DECLARE owner_ref uuid; course_ref uuid; quiz_ref uuid; competency_ref uuid; learner_ref uuid:=gen_random_uuid(); moderator_ref uuid:=gen_random_uuid(); categories jsonb;
BEGIN
  SELECT user_id INTO owner_ref FROM public.user_roles WHERE role='admin' LIMIT 1;
  IF owner_ref IS NULL THEN RAISE EXCEPTION 'Fixture owner required'; END IF;
  INSERT INTO auth.users(id,aud,role,email,created_at,updated_at) VALUES(moderator_ref,'authenticated','authenticated','grading-fixture-'||moderator_ref||'@example.invalid',now(),now());
  INSERT INTO public.user_roles(user_id,role) VALUES(moderator_ref,'admin');
  PERFORM set_config('request.jwt.claim.sub',owner_ref::text,true);
  INSERT INTO public.studio_courses(author_id,title,description) VALUES(owner_ref,'Rollback-only advanced grading','Verified advanced grading fixture with quiz and competency outcomes.') RETURNING id INTO course_ref;
  INSERT INTO public.studio_lessons(course_id,title,kind,body) VALUES(course_ref,'Quiz','quiz','') RETURNING id INTO quiz_ref;
  PERFORM public.studio_save_quiz(quiz_ref,'Quiz',75,'[{"kind":"boolean","q":"Water required?"}]','[0]');
  PERFORM public.studio_approve_review(course_ref);
  PERFORM public.studio_publish_version(course_ref,'Rollback-only grading test');
  competency_ref:=public.add_course_competency(course_ref,'GRADE-01','Technique','Grading fixture competency');
  INSERT INTO public.course_enrollments(user_id,course_id,payment_status) VALUES(learner_ref,course_ref,'free');
  INSERT INTO public.quiz_attempts(user_id,course_id,lesson_id,score,passed) VALUES(learner_ref,course_ref::text,quiz_ref::text,0,false);
  categories:=jsonb_build_array(
    jsonb_build_object('id',gen_random_uuid(),'title','Quizzes','weight',50,'items',jsonb_build_array(jsonb_build_object('kind','quiz','id',quiz_ref))),
    jsonb_build_object('id',gen_random_uuid(),'title','Practical','weight',50,'items',jsonb_build_array(jsonb_build_object('kind','competency','id',competency_ref)))
  );
  PERFORM set_config('test.grading_owner',owner_ref::text,true);
  PERFORM set_config('test.grading_moderator',moderator_ref::text,true);
  PERFORM set_config('test.grading_course',course_ref::text,true);
  PERFORM set_config('test.grading_learner',learner_ref::text,true);
  PERFORM set_config('test.grading_competency',competency_ref::text,true);
  PERFORM set_config('test.grading_categories',categories::text,true);
END;
$fixture$;
SET LOCAL ROLE authenticated;
DO $owner$
DECLARE report jsonb; row_data jsonb; denied boolean:=false; categories jsonb:=current_setting('test.grading_categories')::jsonb; proposal uuid;
BEGIN
  PERFORM public.save_course_grading(current_setting('test.grading_course')::uuid,categories,0);
  report:=public.course_gradebook(current_setting('test.grading_course')::uuid);
  SELECT value INTO row_data FROM jsonb_array_elements(report->'learners') WHERE value->>'userId'=current_setting('test.grading_learner');
  IF row_data->'finalGrade'->'score'<>'null'::jsonb THEN RAISE EXCEPTION 'Missing scores silently counted'; END IF;
  BEGIN PERFORM public.save_course_grading(current_setting('test.grading_course')::uuid,categories,0); EXCEPTION WHEN raise_exception THEN denied:=true; END;
  IF NOT denied THEN RAISE EXCEPTION 'Stale configuration accepted'; END IF;
  denied:=false;
  BEGIN PERFORM public.save_course_grading(current_setting('test.grading_course')::uuid,jsonb_set(categories,'{0,weight}','25'),1); EXCEPTION WHEN raise_exception THEN denied:=true; END;
  IF NOT denied THEN RAISE EXCEPTION 'Incorrect weight total accepted'; END IF;
  PERFORM public.record_competency_assessment(current_setting('test.grading_competency')::uuid,current_setting('test.grading_learner')::uuid,true,80,'Observed safe technique throughout the practical assessment.');
  report:=public.course_gradebook(current_setting('test.grading_course')::uuid);
  SELECT value INTO row_data FROM jsonb_array_elements(report->'learners') WHERE value->>'userId'=current_setting('test.grading_learner');
  IF (row_data->'finalGrade'->>'score')::numeric<>40 THEN RAISE EXCEPTION 'Weighted score or zero score incorrect'; END IF;
  proposal:=public.propose_course_grade(current_setting('test.grading_course')::uuid,current_setting('test.grading_learner')::uuid,90,'Additional assessment evidence supports a moderated final grade.',1,NULL);
  PERFORM set_config('test.grading_proposal',proposal::text,true);
  denied:=false;
  BEGIN PERFORM public.review_course_grade(proposal,true,'Approving my own proposed grade must be denied.'); EXCEPTION WHEN raise_exception THEN denied:=true; END;
  IF NOT denied THEN RAISE EXCEPTION 'Self moderation accepted'; END IF;
END;
$owner$;
SELECT set_config('request.jwt.claim.sub',current_setting('test.grading_moderator'),true);
SELECT public.review_course_grade(current_setting('test.grading_proposal')::uuid,true,'Independent review confirms the evidence and proposed score.');
SELECT set_config('request.jwt.claim.sub',current_setting('test.grading_owner'),true);
DO $approved$
DECLARE report jsonb; row_data jsonb; proposal uuid;
BEGIN
  report:=public.course_gradebook(current_setting('test.grading_course')::uuid);
  SELECT value INTO row_data FROM jsonb_array_elements(report->'learners') WHERE value->>'userId'=current_setting('test.grading_learner');
  IF (row_data->'finalGrade'->>'score')::numeric<>90 OR NOT (row_data->'finalGrade'->>'overridden')::boolean OR (row_data->>'certified')::boolean THEN RAISE EXCEPTION 'Override changed wrong outcome'; END IF;
  IF (row_data->'quizScores'->((current_setting('test.grading_categories')::jsonb)->0->'items'->0->>'id')->>'score')::numeric<>0 THEN RAISE EXCEPTION 'Override rewrote quiz score'; END IF;
  proposal:=public.propose_course_grade(current_setting('test.grading_course')::uuid,current_setting('test.grading_learner')::uuid,95,'A second proposal awaits independent verification and review.',1,current_setting('test.grading_proposal')::uuid);
  PERFORM set_config('test.grading_stale_proposal',proposal::text,true);
  PERFORM public.save_course_grading(current_setting('test.grading_course')::uuid,current_setting('test.grading_categories')::jsonb,1);
  report:=public.course_gradebook(current_setting('test.grading_course')::uuid);
  SELECT value INTO row_data FROM jsonb_array_elements(report->'learners') WHERE value->>'userId'=current_setting('test.grading_learner');
  IF (row_data->'finalGrade'->>'score')::numeric<>40 OR (row_data->'finalGrade'->>'overridden')::boolean THEN RAISE EXCEPTION 'Old override survived changed grading basis'; END IF;
END;
$approved$;
SELECT set_config('request.jwt.claim.sub',current_setting('test.grading_moderator'),true);
DO $stale_review$
DECLARE denied boolean:=false;
BEGIN
  BEGIN PERFORM public.review_course_grade(current_setting('test.grading_stale_proposal')::uuid,true,'An old grading basis must not be approved automatically.'); EXCEPTION WHEN raise_exception THEN denied:=true; END;
  IF NOT denied THEN RAISE EXCEPTION 'Stale proposal approved'; END IF;
  PERFORM public.review_course_grade(current_setting('test.grading_stale_proposal')::uuid,false,'The grading basis changed; a fresh proposal is required.');
END;
$stale_review$;
SELECT set_config('request.jwt.claim.sub',gen_random_uuid()::text,true);
DO $outsider$
DECLARE denied boolean:=false;
BEGIN
  IF EXISTS(SELECT 1 FROM public.course_grade_decisions WHERE course_id=current_setting('test.grading_course')::uuid) THEN RAISE EXCEPTION 'Outsider can read grade reasons'; END IF;
  BEGIN PERFORM public.course_gradebook_export(current_setting('test.grading_course')::uuid); EXCEPTION WHEN raise_exception THEN denied:=true; END;
  IF NOT denied THEN RAISE EXCEPTION 'Outsider can export all grades'; END IF;
  IF has_table_privilege('authenticated','public.course_grade_decisions','UPDATE') THEN RAISE EXCEPTION 'Direct grade rewrite allowed'; END IF;
END;
$outsider$;
RESET ROLE;
INSERT INTO public.course_enrollments(user_id,course_id,payment_status) SELECT gen_random_uuid(),current_setting('test.grading_course')::uuid,'free' FROM generate_series(1,201);
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub',current_setting('test.grading_owner'),true);
DO $export$
DECLARE report jsonb;
BEGIN
  report:=public.course_gradebook_export(current_setting('test.grading_course')::uuid);
  IF (report->>'total')::integer<>202 OR jsonb_array_length(report->'learners')<>202 THEN RAISE EXCEPTION 'Whole course export omitted a page'; END IF;
END;
$export$;
RESET ROLE;
ROLLBACK;
