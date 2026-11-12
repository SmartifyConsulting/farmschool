BEGIN;

DO $fixture$
DECLARE owner_ref uuid; cohort_ref uuid; course_ref uuid; member_ref uuid := gen_random_uuid();
BEGIN
  SELECT user_id INTO owner_ref FROM public.user_roles WHERE role='admin' LIMIT 1;
  IF owner_ref IS NULL THEN RAISE EXCEPTION 'Fixture owner required'; END IF;
  INSERT INTO public.cohorts(name,owner_id) VALUES('Rollback-only cohort verification',owner_ref) RETURNING id INTO cohort_ref;
  INSERT INTO public.studio_courses(author_id,title,description) VALUES(owner_ref,'Rollback-only cohort course','Temporary cohort test') RETURNING id INTO course_ref;
  INSERT INTO public.cohort_members(cohort_id,user_id) VALUES(cohort_ref,member_ref);
  INSERT INTO public.cohort_course_assignments(cohort_id,course_id) VALUES(cohort_ref,course_ref);
  PERFORM set_config('test.cohort',cohort_ref::text,true);
  PERFORM set_config('test.member',member_ref::text,true);
  PERFORM set_config('test.owner',owner_ref::text,true);
END;
$fixture$;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub',current_setting('test.member'),true);
DO $member$
BEGIN
  IF (SELECT count(*) FROM public.cohorts WHERE id=current_setting('test.cohort')::uuid) <> 1 THEN RAISE EXCEPTION 'Member cannot see cohort'; END IF;
  IF (SELECT count(*) FROM public.cohort_course_assignments WHERE cohort_id=current_setting('test.cohort')::uuid) <> 1 THEN RAISE EXCEPTION 'Member cannot see assignment'; END IF;
  BEGIN
    INSERT INTO public.cohort_members(cohort_id,user_id) VALUES(current_setting('test.cohort')::uuid,gen_random_uuid());
    RAISE EXCEPTION 'Member unexpectedly modified cohort';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
END;
$member$;
SELECT set_config('request.jwt.claim.sub',gen_random_uuid()::text,true);
DO $outsider$
BEGIN
  IF EXISTS(SELECT 1 FROM public.cohorts WHERE id=current_setting('test.cohort')::uuid) THEN RAISE EXCEPTION 'Outsider can see cohort'; END IF;
  IF EXISTS(SELECT 1 FROM public.cohort_course_assignments WHERE cohort_id=current_setting('test.cohort')::uuid) THEN RAISE EXCEPTION 'Outsider can see assignment'; END IF;
END;
$outsider$;
SELECT set_config('request.jwt.claim.sub',current_setting('test.owner'),true);
DO $owner$
BEGIN
  IF (SELECT count(*) FROM public.cohort_members WHERE cohort_id=current_setting('test.cohort')::uuid) <> 1 THEN RAISE EXCEPTION 'Owner cannot see members'; END IF;
END;
$owner$;
RESET ROLE;

ROLLBACK;
