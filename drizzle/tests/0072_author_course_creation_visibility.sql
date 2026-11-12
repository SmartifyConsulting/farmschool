BEGIN;
DO $fixture$
DECLARE owner_ref uuid:=gen_random_uuid(); outsider_ref uuid:=gen_random_uuid();
BEGIN
  INSERT INTO auth.users(id,aud,role,email,created_at,updated_at) VALUES(owner_ref,'authenticated','authenticated','creation-owner-'||owner_ref||'@example.invalid',now(),now()),(outsider_ref,'authenticated','authenticated','creation-outsider-'||outsider_ref||'@example.invalid',now(),now());
  PERFORM set_config('test.creation_owner',owner_ref::text,true); PERFORM set_config('test.creation_outsider',outsider_ref::text,true);
END;
$fixture$;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub',current_setting('test.creation_owner'),true);
DO $creation$
DECLARE course_ref uuid; denied boolean:=false;
BEGIN
  IF public.has_role(auth.uid(),'admin') THEN RAISE EXCEPTION 'Fixture unexpectedly has platform privileges'; END IF;
  INSERT INTO public.studio_courses(author_id,title,description) VALUES(auth.uid(),'Author-created draft','Authenticated course creation visibility regression fixture') RETURNING id INTO course_ref;
  IF course_ref IS NULL OR NOT EXISTS(SELECT 1 FROM public.studio_courses WHERE id=course_ref AND NOT published) THEN RAISE EXCEPTION 'Author cannot create and immediately read their draft'; END IF;
  UPDATE public.studio_courses SET title='Updated author draft' WHERE id=course_ref;
  IF NOT EXISTS(SELECT 1 FROM public.studio_courses WHERE id=course_ref AND title='Updated author draft') THEN RAISE EXCEPTION 'Author cannot maintain created draft'; END IF;
  BEGIN INSERT INTO public.studio_courses(author_id,title,description) VALUES(current_setting('test.creation_outsider')::uuid,'Forged owner','Invalid ownership fixture'); EXCEPTION WHEN insufficient_privilege THEN denied:=true; END;
  IF NOT denied THEN RAISE EXCEPTION 'Author forged another owner'; END IF;
  PERFORM set_config('test.creation_course',course_ref::text,true);
END;
$creation$;
SELECT set_config('request.jwt.claim.sub',current_setting('test.creation_outsider'),true);
DO $outsider$
BEGIN
  IF EXISTS(SELECT 1 FROM public.studio_courses WHERE id=current_setting('test.creation_course')::uuid) THEN RAISE EXCEPTION 'Unrelated author can read draft'; END IF;
  UPDATE public.studio_courses SET title='Unauthorized edit' WHERE id=current_setting('test.creation_course')::uuid;
  IF FOUND THEN RAISE EXCEPTION 'Unrelated author changed draft'; END IF;
END;
$outsider$;
RESET ROLE;
ROLLBACK;
