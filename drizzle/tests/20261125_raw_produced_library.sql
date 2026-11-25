BEGIN;
DO $setup$
DECLARE owner_ref uuid; other_ref uuid; raw_a uuid:=gen_random_uuid(); raw_b uuid:=gen_random_uuid(); foreign_raw uuid:=gen_random_uuid(); draft_ref uuid:=gen_random_uuid();
BEGIN
  SELECT r.user_id INTO owner_ref FROM public.user_roles r WHERE r.role='admin' LIMIT 1;
  SELECT p.user_id INTO other_ref FROM public.profiles p WHERE p.user_id<>owner_ref
    AND NOT public.has_role(p.user_id,'admin'::public.app_role) LIMIT 1;
  IF owner_ref IS NULL OR other_ref IS NULL THEN RAISE EXCEPTION 'Two existing fixture identities required'; END IF;
  PERFORM set_config('request.jwt.claim.sub',owner_ref::text,true);
  PERFORM set_config('plusticity.test.owner',owner_ref::text,true);
  PERFORM set_config('plusticity.test.other',other_ref::text,true);
  PERFORM set_config('plusticity.test.raw_a',raw_a::text,true);
  PERFORM set_config('plusticity.test.raw_b',raw_b::text,true);
  PERFORM set_config('plusticity.test.foreign',foreign_raw::text,true);
  PERFORM set_config('plusticity.test.output',gen_random_uuid()::text,true);
  PERFORM set_config('plusticity.test.output2',gen_random_uuid()::text,true);
  PERFORM set_config('plusticity.test.draft',draft_ref::text,true);
  INSERT INTO public.content_library_files(id,author_id,file_name,original_file_name,file_type,storage_path,size_bytes)
    VALUES(raw_a,owner_ref,'Source A.txt','Source A.txt','text',owner_ref::text||'/fixture-a.txt',100),
      (raw_b,owner_ref,'Source B.txt','Source B.txt','text',owner_ref::text||'/fixture-b.txt',100),
      (foreign_raw,other_ref,'Private.txt','Private.txt','text',other_ref::text||'/private-fixture.txt',100);
  INSERT INTO public.studio_courses(id,author_id,title,description) VALUES(draft_ref,owner_ref,'Rollback-only reuse fixture','No learner content or external storage is changed.');
END;
$setup$;
SET LOCAL ROLE authenticated;
DO $owner_checks$
DECLARE owner_ref uuid:=current_setting('plusticity.test.owner')::uuid; a uuid:=current_setting('plusticity.test.raw_a')::uuid; b uuid:=current_setting('plusticity.test.raw_b')::uuid;
  output_ref uuid:=current_setting('plusticity.test.output')::uuid; output2 uuid:=current_setting('plusticity.test.output2')::uuid;
  result uuid; rejected boolean:=false; bad_ref uuid:=gen_random_uuid(); file_ref uuid:=gen_random_uuid(); lesson_ref uuid:=gen_random_uuid(); published_ref uuid;
BEGIN
  result:=public.content_library_register_produced(output_ref,ARRAY[a,b],'Output.md','text',owner_ref::text||'/produced-fixture.md',100);
  PERFORM public.content_library_register_produced(output_ref,ARRAY[b,a,a],'Output.md','text',owner_ref::text||'/produced-fixture.md',100);
  IF result<>output_ref OR (SELECT count(*) FROM public.content_library_derivations WHERE produced_file_id=output_ref)<>2 THEN RAISE EXCEPTION 'Atomic save or repeat-save failed'; END IF;
  PERFORM public.content_library_register_produced(output2,ARRAY[a],'Output.zip','scorm',owner_ref::text||'/produced-fixture.zip',100);
  IF NOT EXISTS(SELECT 1 FROM public.content_library_files WHERE id=a AND material_stage='raw' AND storage_path=owner_ref::text||'/fixture-a.txt') THEN RAISE EXCEPTION 'Original changed'; END IF;
  BEGIN
    PERFORM public.content_library_register_produced(bad_ref,ARRAY[current_setting('plusticity.test.foreign')::uuid],'Forbidden.md','text',owner_ref::text||'/forbidden.md',100);
  EXCEPTION WHEN SQLSTATE 'P0001' THEN rejected:=true; END;
  IF NOT rejected OR EXISTS(SELECT 1 FROM public.content_library_files WHERE id=bad_ref) THEN RAISE EXCEPTION 'Cross-owner source was accepted'; END IF;
  rejected:=false;
  BEGIN
    UPDATE public.content_library_files SET material_stage='produced' WHERE id=a;
  EXCEPTION WHEN SQLSTATE 'P0001' THEN rejected:=true; END;
  IF NOT rejected THEN RAISE EXCEPTION 'Linked source identity changed'; END IF;
  PERFORM public.content_library_attach_to_draft(output_ref,current_setting('plusticity.test.draft')::uuid,file_ref,
    owner_ref::text||'/'||current_setting('plusticity.test.draft')||'/fixture.md',lesson_ref,'## Teaching text');
  PERFORM public.content_library_attach_to_draft(output_ref,current_setting('plusticity.test.draft')::uuid,file_ref,
    owner_ref::text||'/'||current_setting('plusticity.test.draft')||'/fixture.md',lesson_ref,'## Teaching text');
  IF (SELECT count(*) FROM public.studio_lessons WHERE id=lesson_ref AND kind='slide' AND body='## Teaching text')<>1 THEN RAISE EXCEPTION 'Produced lesson copy failed'; END IF;
  SELECT id INTO published_ref FROM public.studio_courses WHERE author_id=owner_ref AND published LIMIT 1;
  IF published_ref IS NULL THEN RAISE EXCEPTION 'Published fixture course required'; END IF;
  rejected:=false;
  BEGIN
    PERFORM public.content_library_attach_to_draft(output_ref,published_ref,gen_random_uuid(),owner_ref::text||'/'||published_ref::text||'/blocked.md');
  EXCEPTION WHEN SQLSTATE 'P0001' THEN rejected:=true; END;
  IF NOT rejected THEN RAISE EXCEPTION 'Published-course protection failed'; END IF;
END;
$owner_checks$;
SET CONSTRAINTS ALL IMMEDIATE;
DO $delete_checks$
DECLARE rejected boolean:=false;
BEGIN
  BEGIN
    DELETE FROM public.content_library_files WHERE id=current_setting('plusticity.test.raw_a')::uuid;
  EXCEPTION WHEN foreign_key_violation THEN rejected:=true; END;
  IF NOT rejected THEN RAISE EXCEPTION 'Linked source deletion was allowed'; END IF;
  DELETE FROM public.content_library_files WHERE id IN(current_setting('plusticity.test.output')::uuid,current_setting('plusticity.test.output2')::uuid);
  IF EXISTS(SELECT 1 FROM public.content_library_derivations WHERE raw_file_id=current_setting('plusticity.test.raw_a')::uuid) THEN RAISE EXCEPTION 'Processed links survived deletion'; END IF;
END;
$delete_checks$;
RESET ROLE;
SELECT set_config('request.jwt.claim.sub',current_setting('plusticity.test.other'),true);
SET LOCAL ROLE authenticated;
DO $isolation$
BEGIN
  IF EXISTS(SELECT 1 FROM public.content_library_files WHERE id=current_setting('plusticity.test.raw_a')::uuid)
    OR EXISTS(SELECT 1 FROM public.content_library_derivations WHERE author_id=current_setting('plusticity.test.owner')::uuid) THEN RAISE EXCEPTION 'Another user can read private material'; END IF;
END;
$isolation$;
ROLLBACK;
