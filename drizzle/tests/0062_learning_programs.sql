BEGIN;
DO $fixture$
DECLARE owner_ref uuid; learner_ref uuid:=gen_random_uuid(); outsider_ref uuid:=gen_random_uuid(); first_course uuid; second_course uuid; cohort_ref uuid; program_ref uuid:=gen_random_uuid(); version_ref uuid; stages jsonb; cert_ref uuid;
BEGIN
  SELECT user_id INTO owner_ref FROM public.user_roles WHERE role='admin' LIMIT 1;
  PERFORM set_config('request.jwt.claim.sub',owner_ref::text,true);
  INSERT INTO public.studio_courses(author_id,title,description) VALUES(owner_ref,'Program first fixture','Rollback-only training content') RETURNING id INTO first_course;
  INSERT INTO public.studio_lessons(course_id,title,kind,body,position) VALUES(first_course,'Read','reading','First training content',0);
  PERFORM public.studio_approve_review(first_course); PERFORM public.studio_publish_version(first_course,'Program fixture');
  INSERT INTO public.studio_courses(author_id,title,description) VALUES(owner_ref,'Program second fixture','Rollback-only training content') RETURNING id INTO second_course;
  INSERT INTO public.studio_lessons(course_id,title,kind,body,position) VALUES(second_course,'Read','reading','Second training content',0);
  PERFORM public.studio_approve_review(second_course); PERFORM public.studio_publish_version(second_course,'Program fixture');
  INSERT INTO public.cohorts(name,owner_id) VALUES('Rollback-only program cohort',owner_ref) RETURNING id INTO cohort_ref;
  INSERT INTO public.cohort_members(cohort_id,user_id) VALUES(cohort_ref,learner_ref);
  stages:=jsonb_build_array(jsonb_build_object('title','Foundation','required',1,'course_ids',jsonb_build_array(first_course)),jsonb_build_object('title','Advanced','required',1,'course_ids',jsonb_build_array(second_course)));
  PERFORM public.save_learning_program(program_ref,'Program fixture','Two stage verification',stages,0);
  version_ref:=public.publish_learning_program(program_ref,1);
  IF public.publish_learning_program(program_ref,1)<>version_ref THEN RAISE EXCEPTION 'Repeated publish created another version'; END IF;
  PERFORM public.assign_cohort_program(cohort_ref,version_ref,clock_timestamp()+interval '7 days',true,0);
  PERFORM public.save_learning_program(program_ref,'Revised program fixture','New version title',stages,1);
  PERFORM public.publish_learning_program(program_ref,2);
  IF NOT EXISTS(SELECT 1 FROM public.learning_program_versions WHERE id=version_ref AND title='Program fixture' AND version=1) THEN RAISE EXCEPTION 'Draft revision rewrote assigned version'; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.cohort_program_assignments WHERE cohort_id=cohort_ref AND version_id=version_ref) THEN RAISE EXCEPTION 'Publishing changed cohort version'; END IF;
  IF has_table_privilege('authenticated','public.program_awards','INSERT') OR has_table_privilege('authenticated','public.learning_program_versions','UPDATE') OR has_function_privilege('authenticated','public.program_progress(uuid,uuid)','EXECUTE') THEN RAISE EXCEPTION 'Private program writes or another learner progress exposed'; END IF;
  PERFORM set_config('test.program_owner',owner_ref::text,true); PERFORM set_config('test.program_learner',learner_ref::text,true); PERFORM set_config('test.program_outsider',outsider_ref::text,true);
  PERFORM set_config('test.program_id',program_ref::text,true); PERFORM set_config('test.program_version',version_ref::text,true); PERFORM set_config('test.program_cohort',cohort_ref::text,true);
  PERFORM set_config('test.program_first',first_course::text,true); PERFORM set_config('test.program_second',second_course::text,true);
END;
$fixture$;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub',current_setting('test.program_learner'),true);
DO $learner_incomplete$
DECLARE progress jsonb; denied boolean:=false;
BEGIN
  IF NOT EXISTS(SELECT 1 FROM public.my_learning_programs() WHERE id=current_setting('test.program_version')::uuid AND title='Program fixture') THEN RAISE EXCEPTION 'Assigned program missing'; END IF;
  progress:=public.my_program_progress(current_setting('test.program_version')::uuid);
  IF (progress->>'complete')::boolean OR (progress->'stages'->1->>'unlocked')::boolean THEN RAISE EXCEPTION 'Incomplete program marked complete or later stage unlocked'; END IF;
  BEGIN PERFORM public.claim_program_award(current_setting('test.program_version')::uuid); EXCEPTION WHEN raise_exception THEN denied:=true; END;
  IF NOT denied THEN RAISE EXCEPTION 'Learner forged program completion'; END IF;
END;
$learner_incomplete$;
RESET ROLE;
INSERT INTO public.certificates(user_id,source,course_ref,title,course_version,validated_at,curriculum_digest) VALUES(current_setting('test.program_learner')::uuid,'studio',current_setting('test.program_first'),'First fixture',1,clock_timestamp(),'test');
SET LOCAL ROLE authenticated;
DO $first_stage$
DECLARE progress jsonb;
BEGIN
  progress:=public.my_program_progress(current_setting('test.program_version')::uuid);
  IF NOT (progress->'stages'->1->>'unlocked')::boolean OR (progress->>'complete')::boolean THEN RAISE EXCEPTION 'Stage order failed'; END IF;
END;
$first_stage$;
RESET ROLE;
INSERT INTO public.certificates(user_id,source,course_ref,title,course_version,validated_at,curriculum_digest) VALUES(current_setting('test.program_learner')::uuid,'studio',current_setting('test.program_second'),'Second fixture',1,clock_timestamp(),'test');
SET LOCAL ROLE authenticated;
DO $award$
DECLARE first_ref uuid; second_ref uuid;
BEGIN
  first_ref:=public.claim_program_award(current_setting('test.program_version')::uuid); second_ref:=public.claim_program_award(current_setting('test.program_version')::uuid);
  IF first_ref<>second_ref THEN RAISE EXCEPTION 'Duplicate award created'; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.program_awards WHERE id=first_ref AND jsonb_array_length(evidence)=2) THEN RAISE EXCEPTION 'Award evidence snapshot missing'; END IF;
  PERFORM set_config('test.program_award',first_ref::text,true);
END;
$award$;
SELECT set_config('request.jwt.claim.sub',current_setting('test.program_outsider'),true);
DO $outsider$
DECLARE denied boolean:=false;
BEGIN
  IF public.my_program_progress(current_setting('test.program_version')::uuid) IS NOT NULL OR EXISTS(SELECT 1 FROM public.cohort_program_assignments WHERE cohort_id=current_setting('test.program_cohort')::uuid)
    OR EXISTS(SELECT 1 FROM public.program_awards WHERE id=current_setting('test.program_award')::uuid) THEN RAISE EXCEPTION 'Outsider sees private program records'; END IF;
  BEGIN PERFORM public.cohort_program_progress(current_setting('test.program_cohort')::uuid,current_setting('test.program_version')::uuid); EXCEPTION WHEN raise_exception THEN denied:=true; END;
  IF NOT denied THEN RAISE EXCEPTION 'Unscoped report exposed learner progress'; END IF;
END;
$outsider$;
RESET ROLE;
DO $unrelated_member$
DECLARE other_cohort uuid;
BEGIN
  INSERT INTO public.cohorts(name,owner_id) VALUES('Unrelated cohort fixture',current_setting('test.program_owner')::uuid) RETURNING id INTO other_cohort;
  INSERT INTO public.cohort_members(cohort_id,user_id) VALUES(other_cohort,current_setting('test.program_outsider')::uuid);
END;
$unrelated_member$;
SET LOCAL ROLE authenticated;
DO $unrelated_visibility$
BEGIN
  IF EXISTS(SELECT 1 FROM public.cohort_program_assignments WHERE cohort_id=current_setting('test.program_cohort')::uuid) THEN RAISE EXCEPTION 'Unrelated membership leaks assignments'; END IF;
END;
$unrelated_visibility$;
RESET ROLE;
UPDATE public.certificates SET expires_at=clock_timestamp()-interval '1 day' WHERE user_id=current_setting('test.program_learner')::uuid AND course_ref=current_setting('test.program_first');
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub',current_setting('test.program_owner'),true);
DO $report_expiry$
BEGIN
  IF NOT EXISTS(SELECT 1 FROM public.cohort_program_progress(current_setting('test.program_cohort')::uuid,current_setting('test.program_version')::uuid) WHERE user_id=current_setting('test.program_learner')::uuid AND NOT complete AND completed_stages=1) THEN RAISE EXCEPTION 'Report ignores certificate expiry'; END IF;
END;
$report_expiry$;
RESET ROLE;
DO $elective_and_validation$
DECLARE elective_program uuid:=gen_random_uuid(); elective_version uuid; rejected boolean:=false; duplicate_stages jsonb; claim_ref uuid;
BEGIN
  duplicate_stages:=jsonb_build_array(jsonb_build_object('title','Repeated course','required',1,'course_ids',jsonb_build_array(current_setting('test.program_second'),current_setting('test.program_second'))));
  BEGIN PERFORM public.save_learning_program(elective_program,'Invalid duplicate program','Must reject duplicate course identifiers',duplicate_stages,0); EXCEPTION WHEN raise_exception THEN rejected:=true; END;
  IF NOT rejected THEN RAISE EXCEPTION 'Duplicate course accepted'; END IF;
  PERFORM public.save_learning_program(elective_program,'Elective program','One current certificate among alternatives',jsonb_build_array(jsonb_build_object('title','Choose one','required',1,'course_ids',jsonb_build_array(current_setting('test.program_first'),current_setting('test.program_second')))),0);
  elective_version:=public.publish_learning_program(elective_program,1);
  PERFORM public.assign_cohort_program(current_setting('test.program_cohort')::uuid,elective_version,NULL,true,0);
  PERFORM set_config('request.jwt.claim.sub',current_setting('test.program_learner'),true);
  claim_ref:=public.claim_program_award(elective_version);
  IF NOT EXISTS(SELECT 1 FROM public.program_awards WHERE id=claim_ref AND jsonb_array_length(evidence)=1 AND evidence->0->>'course_ref'=current_setting('test.program_second')) THEN RAISE EXCEPTION 'Elective award requires expired optional course or lacks chosen evidence'; END IF;
  PERFORM set_config('request.jwt.claim.sub',current_setting('test.program_owner'),true);
END;
$elective_and_validation$;
SET LOCAL ROLE authenticated;
SELECT public.assign_cohort_program(current_setting('test.program_cohort')::uuid,current_setting('test.program_version')::uuid,NULL,false,1);
SELECT set_config('request.jwt.claim.sub',current_setting('test.program_learner'),true);
DO $ended$
DECLARE denied boolean:=false;
BEGIN
  IF EXISTS(SELECT 1 FROM public.my_learning_programs() WHERE id=current_setting('test.program_version')::uuid) THEN RAISE EXCEPTION 'Ended assignment remains active'; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.program_awards WHERE id=current_setting('test.program_award')::uuid) THEN RAISE EXCEPTION 'Ending assignment erased award'; END IF;
  BEGIN PERFORM public.claim_program_award(current_setting('test.program_version')::uuid); EXCEPTION WHEN raise_exception THEN denied:=true; END;
  IF NOT denied THEN RAISE EXCEPTION 'Ended assignment can issue award'; END IF;
END;
$ended$;
RESET ROLE;
ROLLBACK;
