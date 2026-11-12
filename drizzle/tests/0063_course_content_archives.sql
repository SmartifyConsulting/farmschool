BEGIN;
DO $fixture$
DECLARE owner_ref uuid; course_ref uuid; module_ref uuid; reading_ref uuid; quiz_ref uuid; archive jsonb;
BEGIN
  SELECT user_id INTO owner_ref FROM public.user_roles WHERE role='admin' LIMIT 1;
  PERFORM set_config('request.jwt.claim.sub',owner_ref::text,true);
  INSERT INTO public.studio_courses(author_id,title,description,price_cents) VALUES(owner_ref,'Archive fixture','Rollback-only native content restoration',2000) RETURNING id INTO course_ref;
  INSERT INTO public.studio_modules(course_id,title,position) VALUES(course_ref,'Module',0) RETURNING id INTO module_ref;
  INSERT INTO public.studio_lessons(course_id,module_id,title,kind,body,position) VALUES(course_ref,module_ref,'Read','reading','Archive reading content',0) RETURNING id INTO reading_ref;
  INSERT INTO public.studio_lessons(course_id,module_id,title,kind,body,position) VALUES(course_ref,module_ref,'Quiz','quiz','',1) RETURNING id INTO quiz_ref;
  PERFORM public.studio_save_quiz_pool(quiz_ref,'Quiz',75,'[{"kind":"boolean","q":"Restored content requires review?"},{"kind":"blank","q":"Type yes"}]','[0,["yes"]]',1);
  INSERT INTO public.studio_learning_activities(course_id,activity_key,lesson_title,kind,prompt,evidence,approved) VALUES(course_ref,'activity','Read','steps','Practice the technique.','Describe the result.',true);
  PERFORM public.studio_approve_review(course_ref); PERFORM public.studio_publish_version(course_ref,'Archive source fixture');
  archive:=public.export_course_archive(course_ref);
  IF jsonb_array_length(archive->'snapshot'->'answers')<>1 OR archive->'snapshot' ?| ARRAY['learners','certificates','enrollments'] THEN RAISE EXCEPTION 'Content archive incomplete or contains learner records'; END IF;
  PERFORM set_config('test.archive_owner',owner_ref::text,true); PERFORM set_config('test.archive_source',course_ref::text,true); PERFORM set_config('test.archive_file',archive::text,true); PERFORM set_config('test.archive_request',gen_random_uuid()::text,true);
  IF has_table_privilege('authenticated','public.course_archive_restores','INSERT') THEN RAISE EXCEPTION 'Restore request history directly writable'; END IF;
END;
$fixture$;
SET LOCAL ROLE authenticated;
DO $restore$
DECLARE archive jsonb:=current_setting('test.archive_file')::jsonb; target uuid; repeated uuid; denied boolean:=false; quizzes integer;
BEGIN
  target:=public.restore_course_archive(current_setting('test.archive_request')::uuid,archive);
  repeated:=public.restore_course_archive(current_setting('test.archive_request')::uuid,archive);
  IF target<>repeated OR target=current_setting('test.archive_source')::uuid THEN RAISE EXCEPTION 'Restore retry copied twice or overwrote source'; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.studio_courses WHERE id=target AND author_id=auth.uid() AND NOT published AND revision_of IS NULL AND price_cents=0) THEN RAISE EXCEPTION 'Restore trusted archive publication, price or ownership'; END IF;
  IF (SELECT count(*) FROM public.studio_lessons WHERE course_id=target)<>2 OR (SELECT count(*) FROM public.studio_modules WHERE course_id=target)<>1 THEN RAISE EXCEPTION 'Curriculum not restored'; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.studio_lessons l JOIN public.studio_quiz_answers a ON a.lesson_id=l.id WHERE l.course_id=target AND l.body=E'pass:75\nsample:1' AND a.answers='[0,["yes"]]') THEN RAISE EXCEPTION 'Random quiz settings or private keys not restored'; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.studio_learning_activities WHERE course_id=target AND NOT approved) THEN RAISE EXCEPTION 'Activity approval incorrectly trusted'; END IF;
  BEGIN PERFORM public.restore_course_archive(current_setting('test.archive_request')::uuid,jsonb_set(archive,'{snapshot,course,title}','"Changed title"')); EXCEPTION WHEN raise_exception THEN denied:=true; END;
  IF NOT denied THEN RAISE EXCEPTION 'Restore nonce accepted different content'; END IF;
  PERFORM set_config('test.archive_target',target::text,true);
END;
$restore$;
RESET ROLE;
DO $$ BEGIN IF EXISTS(SELECT 1 FROM public.studio_review_approvals WHERE course_id=current_setting('test.archive_target')::uuid) THEN RAISE EXCEPTION 'Course review approval incorrectly trusted'; END IF; END; $$;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub',gen_random_uuid()::text,true);
DO $outsider$
DECLARE denied boolean:=false;
BEGIN
  BEGIN PERFORM public.export_course_archive(current_setting('test.archive_source')::uuid); EXCEPTION WHEN raise_exception THEN denied:=true; END;
  IF NOT denied THEN RAISE EXCEPTION 'Nonowner exported private answers'; END IF;
  IF EXISTS(SELECT 1 FROM public.studio_quiz_answers WHERE course_id=current_setting('test.archive_target')::uuid) THEN RAISE EXCEPTION 'Restored answer keys exposed to outsider'; END IF;
END;
$outsider$;
SELECT set_config('request.jwt.claim.sub',current_setting('test.archive_owner'),true);
DO $atomic_failure$
DECLARE archive jsonb:=current_setting('test.archive_file')::jsonb; before_count bigint; denied boolean:=false;
BEGIN
  SELECT count(*) INTO before_count FROM public.studio_courses WHERE author_id=auth.uid();
  BEGIN PERFORM public.restore_course_archive(gen_random_uuid(),jsonb_set(archive,'{snapshot,answers,0,answers}','[1]')); EXCEPTION WHEN raise_exception THEN denied:=true; END;
  IF NOT denied OR (SELECT count(*) FROM public.studio_courses WHERE author_id=auth.uid())<>before_count THEN RAISE EXCEPTION 'Invalid archive left a partial course'; END IF;
  denied:=false;
  BEGIN PERFORM public.restore_course_archive(gen_random_uuid(),jsonb_set(archive,'{snapshot,lessons,0,kind}','"scorm"')); EXCEPTION WHEN raise_exception THEN denied:=true; END;
  IF NOT denied OR (SELECT count(*) FROM public.studio_courses WHERE author_id=auth.uid())<>before_count THEN RAISE EXCEPTION 'Unsupported SCORM archive left partial content'; END IF;
  IF public.studio_delete_draft(current_setting('test.archive_target')::uuid)<>'deleted' THEN RAISE EXCEPTION 'Restore history prevents draft deletion'; END IF;
END;
$atomic_failure$;
RESET ROLE;
ROLLBACK;
