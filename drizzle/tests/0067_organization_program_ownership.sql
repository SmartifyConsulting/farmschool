BEGIN;
DO $fixture$
DECLARE owner_ref uuid; manager_a uuid:=gen_random_uuid(); manager_b uuid:=gen_random_uuid(); outsider_ref uuid:=gen_random_uuid(); learner_ref uuid:=gen_random_uuid(); org_ref uuid:=gen_random_uuid(); other_org uuid:=gen_random_uuid(); private_ref uuid; public_ref uuid; cohort_ref uuid:=gen_random_uuid(); foreign_cohort uuid:=gen_random_uuid(); program_ref uuid:=gen_random_uuid();
BEGIN
  SELECT user_id INTO owner_ref FROM public.user_roles WHERE role='admin' LIMIT 1;
  INSERT INTO auth.users(id,aud,role,email,created_at,updated_at) VALUES(manager_a,'authenticated','authenticated','program-a-'||manager_a||'@example.invalid',now(),now()),(manager_b,'authenticated','authenticated','program-b-'||manager_b||'@example.invalid',now(),now()),(outsider_ref,'authenticated','authenticated','program-outsider-'||outsider_ref||'@example.invalid',now(),now()),(learner_ref,'authenticated','authenticated','program-learner-'||learner_ref||'@example.invalid',now(),now());
  PERFORM set_config('request.jwt.claim.sub',owner_ref::text,true);
  PERFORM public.save_organization(org_ref,'Company program tenant','','#123456',NULL,0); PERFORM public.save_organization(other_org,'Other program tenant','','#654321',NULL,0);
  PERFORM public.set_organization_member(org_ref,'program-a-'||manager_a||'@example.invalid','manager',NULL,NULL,'Manager A',0);
  PERFORM public.set_organization_member(org_ref,'program-b-'||manager_b||'@example.invalid','manager',NULL,NULL,'Manager B',0);
  PERFORM public.set_organization_member(org_ref,'program-learner-'||learner_ref||'@example.invalid','learner',NULL,NULL,'Learner',0);
  PERFORM public.set_organization_member(other_org,'program-outsider-'||outsider_ref||'@example.invalid','manager',NULL,NULL,'Other manager',0);
  INSERT INTO public.studio_courses(author_id,title,description) VALUES(owner_ref,'Company private course','Private course for company program delegation tests') RETURNING id INTO private_ref;
  INSERT INTO public.studio_lessons(course_id,title,kind,body,position) VALUES(private_ref,'Read','reading','Company training content',0);
  PERFORM public.set_course_organization(private_ref,org_ref,NULL); PERFORM public.studio_approve_review(private_ref); PERFORM public.studio_publish_version(private_ref,'Company program fixture');
  INSERT INTO public.studio_courses(author_id,title,description) VALUES(owner_ref,'Initially public course','Public course later restricted to another company') RETURNING id INTO public_ref;
  INSERT INTO public.studio_lessons(course_id,title,kind,body,position) VALUES(public_ref,'Read','reading','Public training content',0);
  PERFORM public.studio_approve_review(public_ref); PERFORM public.studio_publish_version(public_ref,'Program title redaction fixture');
  PERFORM public.create_organization_cohort(org_ref,cohort_ref,'Company program cohort'); PERFORM public.set_organization_cohort_member(cohort_ref,learner_ref,true);
  PERFORM public.create_organization_cohort(other_org,foreign_cohort,'Other program cohort');
  PERFORM set_config('test.cp_owner',owner_ref::text,true); PERFORM set_config('test.cp_a',manager_a::text,true); PERFORM set_config('test.cp_b',manager_b::text,true); PERFORM set_config('test.cp_outsider',outsider_ref::text,true); PERFORM set_config('test.cp_learner',learner_ref::text,true);
  PERFORM set_config('test.cp_org',org_ref::text,true); PERFORM set_config('test.cp_other_org',other_org::text,true); PERFORM set_config('test.cp_private',private_ref::text,true); PERFORM set_config('test.cp_public',public_ref::text,true);
  PERFORM set_config('test.cp_cohort',cohort_ref::text,true); PERFORM set_config('test.cp_other_cohort',foreign_cohort::text,true); PERFORM set_config('test.cp_program',program_ref::text,true);
END;
$fixture$;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub',current_setting('test.cp_a'),true);
DO $creator$
DECLARE program_ref uuid:=current_setting('test.cp_program')::uuid; version_ref uuid;
BEGIN
  PERFORM public.save_organization_program(current_setting('test.cp_org')::uuid,program_ref,'Company program','Shared managerial control',jsonb_build_array(jsonb_build_object('title','Company foundation','required',1,'course_ids',jsonb_build_array(current_setting('test.cp_private')))),0);
  version_ref:=public.publish_learning_program(program_ref,1);
  PERFORM public.assign_organization_program(current_setting('test.cp_cohort')::uuid,version_ref,NULL,true,0);
  PERFORM set_config('test.cp_version',version_ref::text,true);
  IF public.has_role(auth.uid(),'admin') THEN RAISE EXCEPTION 'Company program management granted platform administration'; END IF;
END;
$creator$;
SELECT set_config('request.jwt.claim.sub',current_setting('test.cp_b'),true);
DO $colleague$
BEGIN
  IF NOT EXISTS(SELECT 1 FROM public.organization_program_drafts(current_setting('test.cp_org')::uuid) WHERE id=current_setting('test.cp_program')::uuid) THEN RAISE EXCEPTION 'Company colleague cannot read program draft'; END IF;
  PERFORM public.save_learning_program(current_setting('test.cp_program')::uuid,'Company program revised','A colleague maintains the company program',jsonb_build_array(jsonb_build_object('title','Company foundation','required',1,'course_ids',jsonb_build_array(current_setting('test.cp_private')))),1);
  PERFORM public.publish_learning_program(current_setting('test.cp_program')::uuid,2);
  IF NOT EXISTS(SELECT 1 FROM public.learning_program_versions WHERE id=current_setting('test.cp_version')::uuid AND title='Company program' AND version=1) THEN RAISE EXCEPTION 'Colleague rewrote published program version'; END IF;
END;
$colleague$;
SELECT set_config('request.jwt.claim.sub',current_setting('test.cp_outsider'),true);
DO $outsider$
DECLARE denied boolean:=false;
BEGIN
  IF EXISTS(SELECT 1 FROM public.learning_programs WHERE id=current_setting('test.cp_program')::uuid) OR EXISTS(SELECT 1 FROM public.organization_program_versions(current_setting('test.cp_org')::uuid)) THEN RAISE EXCEPTION 'Company draft or version leaked to other tenant'; END IF;
  BEGIN PERFORM public.save_learning_program(current_setting('test.cp_program')::uuid,'Unauthorized edit','Other company must not edit this program',jsonb_build_array(jsonb_build_object('title','Stage','required',1,'course_ids',jsonb_build_array(current_setting('test.cp_public')))),2); EXCEPTION WHEN raise_exception THEN denied:=true; END;
  IF NOT denied THEN RAISE EXCEPTION 'Other company edited corporate program'; END IF;
  denied:=false; BEGIN PERFORM public.assign_organization_program(current_setting('test.cp_other_cohort')::uuid,current_setting('test.cp_version')::uuid,NULL,true,0); EXCEPTION WHEN raise_exception THEN denied:=true; END;
  IF NOT denied THEN RAISE EXCEPTION 'Corporate program assigned to another tenant'; END IF;
END;
$outsider$;
SELECT set_config('request.jwt.claim.sub',current_setting('test.cp_owner'),true);
SELECT public.set_organization_member(current_setting('test.cp_org')::uuid,'program-a-'||current_setting('test.cp_a')||'@example.invalid','learner',NULL,NULL,'Former manager',1);
SELECT set_config('request.jwt.claim.sub',current_setting('test.cp_a'),true);
DO $former_creator$
DECLARE denied boolean:=false;
BEGIN
  IF EXISTS(SELECT 1 FROM public.learning_programs WHERE id=current_setting('test.cp_program')::uuid) OR EXISTS(SELECT 1 FROM public.learning_program_versions WHERE id=current_setting('test.cp_version')::uuid) THEN RAISE EXCEPTION 'Former creator retains private company program access'; END IF;
  BEGIN PERFORM public.publish_learning_program(current_setting('test.cp_program')::uuid,2); EXCEPTION WHEN raise_exception THEN denied:=true; END;
  IF NOT denied THEN RAISE EXCEPTION 'Former creator published company program'; END IF;
END;
$former_creator$;
SELECT set_config('request.jwt.claim.sub',current_setting('test.cp_b'),true);
DO $succession$
DECLARE redaction_program uuid:=gen_random_uuid(); redaction_version uuid;
BEGIN
  PERFORM public.save_organization_program(current_setting('test.cp_org')::uuid,current_setting('test.cp_program')::uuid,'Company program maintained','Management survives the original creator leaving',jsonb_build_array(jsonb_build_object('title','Company foundation','required',1,'course_ids',jsonb_build_array(current_setting('test.cp_private')))),2);
  PERFORM public.publish_learning_program(current_setting('test.cp_program')::uuid,3);
  PERFORM public.save_organization_program(current_setting('test.cp_org')::uuid,redaction_program,'Metadata boundary program','A public course may become private elsewhere',jsonb_build_array(jsonb_build_object('title','Public stage','required',1,'course_ids',jsonb_build_array(current_setting('test.cp_public')))),0);
  redaction_version:=public.publish_learning_program(redaction_program,1);
  PERFORM set_config('test.cp_redaction',redaction_version::text,true);
END;
$succession$;
SELECT set_config('request.jwt.claim.sub',current_setting('test.cp_owner'),true);
UPDATE public.studio_courses SET published=false WHERE id=current_setting('test.cp_public')::uuid;
SELECT public.set_course_organization(current_setting('test.cp_public')::uuid,current_setting('test.cp_other_org')::uuid,NULL);
UPDATE public.studio_courses SET title='New confidential tenant-only title' WHERE id=current_setting('test.cp_public')::uuid;
SELECT public.studio_publish_version(current_setting('test.cp_public')::uuid,'Private metadata fixture');
SELECT set_config('request.jwt.claim.sub',current_setting('test.cp_b'),true);
DO $redacted$
DECLARE result jsonb;
BEGIN
  result:=public.my_program_progress(current_setting('test.cp_redaction')::uuid);
  IF result->'stages'->0->'courses'->0->>'title'<>'Unavailable course' OR (result->'stages'->0->'courses'->0->>'published')::boolean THEN RAISE EXCEPTION 'Historical program leaks a new private course title'; END IF;
END;
$redacted$;
SELECT set_config('request.jwt.claim.sub',current_setting('test.cp_learner'),true);
DO $learner$
BEGIN
  IF public.my_program_progress(current_setting('test.cp_version')::uuid) IS NULL OR EXISTS(SELECT 1 FROM public.learning_programs WHERE id=current_setting('test.cp_program')::uuid) THEN RAISE EXCEPTION 'Assigned learner cannot read their published program or can read company drafts'; END IF;
END;
$learner$;
RESET ROLE;
ROLLBACK;
