BEGIN;
DO $fixture$
DECLARE owner_ref uuid; viewer_ref uuid:=gen_random_uuid(); library_ref uuid; question_ref uuid;
BEGIN
  SELECT user_id INTO owner_ref FROM public.user_roles WHERE role='admin' LIMIT 1;
  IF owner_ref IS NULL THEN RAISE EXCEPTION 'Fixture owner required'; END IF;
  INSERT INTO auth.users(id,aud,role,email,email_confirmed_at,created_at,updated_at) VALUES(viewer_ref,'authenticated','authenticated','library-fixture-'||viewer_ref||'@example.invalid',now(),now(),now());
  PERFORM set_config('request.jwt.claim.sub',owner_ref::text,true);
  library_ref:=public.create_question_library('Rollback-only shared library');
  question_ref:=public.save_library_question(library_ref,NULL,'Crops','{"kind":"boolean","q":"Water required?"}','0',0);
  PERFORM public.grant_question_library_access(library_ref,'library-fixture-'||viewer_ref||'@example.invalid','viewer');
  PERFORM set_config('test.library_owner',owner_ref::text,true); PERFORM set_config('test.library_viewer',viewer_ref::text,true); PERFORM set_config('test.library_id',library_ref::text,true); PERFORM set_config('test.library_question',question_ref::text,true);
END;
$fixture$;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub',current_setting('test.library_viewer'),true);
DO $reader$
DECLARE denied boolean:=false; exported jsonb; before_count integer;
BEGIN
  IF NOT EXISTS(SELECT 1 FROM public.quiz_question_bank WHERE id=current_setting('test.library_question')::uuid AND answer='0') THEN RAISE EXCEPTION 'Reader cannot access shared answer'; END IF;
  exported:=public.export_bank_questions(current_setting('test.library_id')::uuid);
  IF jsonb_array_length(exported->'entries')<>1 THEN RAISE EXCEPTION 'Reader export incomplete'; END IF;
  BEGIN PERFORM public.save_library_question(current_setting('test.library_id')::uuid,current_setting('test.library_question')::uuid,'Crops','{"kind":"boolean","q":"Reader edit"}','1',1); EXCEPTION WHEN raise_exception THEN denied:=true; END;
  IF NOT denied THEN RAISE EXCEPTION 'Read-only member edited answer'; END IF;
  denied:=false;
  BEGIN PERFORM public.delete_bank_question(current_setting('test.library_question')::uuid,1); EXCEPTION WHEN raise_exception THEN denied:=true; END;
  IF NOT denied THEN RAISE EXCEPTION 'Read-only member deleted question'; END IF;
  PERFORM public.import_bank_questions(NULL,exported->'entries');
  SELECT count(*) INTO before_count FROM public.quiz_question_bank WHERE owner_id=auth.uid() AND library_id IS NULL;
  denied:=false;
  BEGIN PERFORM public.import_bank_questions(NULL,'[{"category":"Valid","question":{"kind":"boolean","q":"Valid"},"answer":0},{"category":"Invalid","question":{"kind":"boolean","q":"Invalid"},"answer":5}]'); EXCEPTION WHEN raise_exception THEN denied:=true; END;
  IF NOT denied OR (SELECT count(*) FROM public.quiz_question_bank WHERE owner_id=auth.uid() AND library_id IS NULL)<>before_count THEN RAISE EXCEPTION 'Failed batch left a partial import'; END IF;
END;
$reader$;
SELECT set_config('request.jwt.claim.sub',current_setting('test.library_owner'),true);
SELECT public.grant_question_library_access(current_setting('test.library_id')::uuid,'library-fixture-'||current_setting('test.library_viewer')||'@example.invalid','editor');
SELECT set_config('request.jwt.claim.sub',current_setting('test.library_viewer'),true);
DO $editor$
DECLARE created uuid; denied boolean:=false;
BEGIN
  PERFORM public.save_library_question(current_setting('test.library_id')::uuid,current_setting('test.library_question')::uuid,'Crops','{"kind":"boolean","q":"Updated by editor"}','1',1);
  created:=public.save_library_question(current_setting('test.library_id')::uuid,NULL,'Crops','{"kind":"blank","q":"Name a crop"}','["maize"]',0);
  PERFORM set_config('test.library_created',created::text,true);
  BEGIN PERFORM public.grant_question_library_access(current_setting('test.library_id')::uuid,'library-fixture-'||auth.uid()||'@example.invalid','editor'); EXCEPTION WHEN raise_exception THEN denied:=true; END;
  IF NOT denied THEN RAISE EXCEPTION 'Editor granted access to others'; END IF;
END;
$editor$;
SELECT set_config('request.jwt.claim.sub',gen_random_uuid()::text,true);
DO $outsider$
DECLARE denied boolean:=false;
BEGIN
  IF EXISTS(SELECT 1 FROM public.quiz_question_bank WHERE library_id=current_setting('test.library_id')::uuid) THEN RAISE EXCEPTION 'Outsider can read shared keys'; END IF;
  BEGIN PERFORM public.export_bank_questions(current_setting('test.library_id')::uuid); EXCEPTION WHEN raise_exception THEN denied:=true; END;
  IF NOT denied THEN RAISE EXCEPTION 'Outsider can export shared keys'; END IF;
END;
$outsider$;
SELECT set_config('request.jwt.claim.sub',current_setting('test.library_owner'),true);
SELECT public.remove_question_library_access(current_setting('test.library_id')::uuid,current_setting('test.library_viewer')::uuid);
SELECT set_config('request.jwt.claim.sub',current_setting('test.library_viewer'),true);
DO $revoked$
DECLARE denied boolean:=false;
BEGIN
  IF EXISTS(SELECT 1 FROM public.quiz_question_bank WHERE id=current_setting('test.library_question')::uuid) THEN RAISE EXCEPTION 'Removed member still reads others questions'; END IF;
  IF EXISTS(SELECT 1 FROM public.quiz_question_bank WHERE id=current_setting('test.library_created')::uuid) THEN RAISE EXCEPTION 'Former creator bypasses revoked library read access'; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.quiz_question_bank WHERE owner_id=auth.uid() AND library_id IS NULL) THEN RAISE EXCEPTION 'Independent personal copy was removed'; END IF;
  BEGIN PERFORM public.save_bank_question(current_setting('test.library_created')::uuid,'Bypass','{"kind":"boolean","q":"Private route bypass"}','1',1); EXCEPTION WHEN raise_exception THEN denied:=true; END;
  IF NOT denied THEN RAISE EXCEPTION 'Former editor bypassed membership via private save'; END IF;
  denied:=false;
  BEGIN PERFORM public.delete_bank_question(current_setting('test.library_created')::uuid,1); EXCEPTION WHEN raise_exception THEN denied:=true; END;
  IF NOT denied THEN RAISE EXCEPTION 'Former editor deleted team question'; END IF;
END;
$revoked$;
RESET ROLE;
ROLLBACK;
