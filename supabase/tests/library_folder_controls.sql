-- Fixture-only checks; every row and change is rolled back.
begin;
do $$
declare
  owner_ref uuid; parent_ref uuid := gen_random_uuid(); folder_ref uuid := gen_random_uuid();
  child_ref uuid := gen_random_uuid(); raw_ref uuid := gen_random_uuid(); output_ref uuid := gen_random_uuid();
  blocked boolean;
begin
  select id into owner_ref from auth.users order by created_at limit 1;
  if owner_ref is null then raise exception 'A signed-up user is needed for the fixture.'; end if;
  perform set_config('request.jwt.claim.sub', owner_ref::text, true);
  insert into public.content_library_folders(id,author_id,name,color) values(parent_ref,owner_ref,'Rollback parent','#2765bc');
  insert into public.content_library_folders(id,author_id,parent_id,name,color) values(folder_ref,owner_ref,parent_ref,'Rollback folder','#22c55e');
  insert into public.content_library_folders(id,author_id,parent_id,name) values(child_ref,owner_ref,folder_ref,'Rollback child');
  insert into public.content_library_files(id,author_id,folder_id,file_name,original_file_name,file_type,storage_path,size_bytes,material_stage)
    values(raw_ref,owner_ref,folder_ref,'Rollback source.pdf','Rollback source.pdf','pdf',owner_ref::text || '/fixture/source.pdf',1,'raw'),
      (output_ref,owner_ref,folder_ref,'Rollback output.html','Rollback output.html','text',owner_ref::text || '/fixture/output.html',1,'produced');
  insert into public.content_library_derivations(author_id,raw_file_id,produced_file_id) values(owner_ref,raw_ref,output_ref);
  blocked := false;
  begin update public.content_library_folders set color = 'invalid' where id = folder_ref;
  exception when check_violation then blocked := true; end;
  if not blocked then raise exception 'Invalid colour accepted'; end if;
  perform set_config('request.jwt.claim.sub', '', true);
  blocked := false;
  begin perform public.delete_library_folder(folder_ref);
  exception when raise_exception then if sqlerrm = 'Sign in to manage your folders.' then blocked := true; else raise; end if; end;
  if not blocked then raise exception 'Signed-out delete permitted'; end if;
  perform set_config('request.jwt.claim.sub', gen_random_uuid()::text, true);
  blocked := false;
  begin perform public.delete_library_folder(folder_ref);
  exception when raise_exception then if sqlerrm = 'Choose a folder you own.' then blocked := true; else raise; end if; end;
  if not blocked then raise exception 'Foreign delete permitted'; end if;
  if has_function_privilege('anon','public.delete_library_folder(uuid)','execute') then raise exception 'Anonymous execution remains'; end if;
  perform set_config('request.jwt.claim.sub', owner_ref::text, true);
  perform public.delete_library_folder(folder_ref);
  if exists(select 1 from public.content_library_folders where id = folder_ref) then raise exception 'Container remains'; end if;
  if not exists(select 1 from public.content_library_folders where id=child_ref and parent_id=parent_ref) then raise exception 'Child folder lost'; end if;
  if (select count(*) from public.content_library_files where id in(raw_ref,output_ref) and folder_id=parent_ref) <> 2 then raise exception 'Material lost'; end if;
  if not exists(select 1 from public.content_library_derivations where raw_file_id=raw_ref and produced_file_id=output_ref) then raise exception 'Source link lost'; end if;
  perform public.delete_library_folder(parent_ref);
  if (select count(*) from public.content_library_files where id in(raw_ref,output_ref) and folder_id is null) <> 2 then raise exception 'Root material lost'; end if;
  if not exists(select 1 from public.content_library_folders where id=child_ref and parent_id is null) then raise exception 'Root child lost'; end if;
end;
$$;
select 'PASS: valid colours, ownership checks, preserved raw/produced files, source links and child folders' as result;
rollback;
