begin;
select set_config('studio_test.owner',(select id::text from auth.users order by created_at limit 1),true);
select set_config('studio_test.project',gen_random_uuid()::text,true);
select set_config('studio_test.course',gen_random_uuid()::text,true);
select set_config('request.jwt.claim.sub',current_setting('studio_test.owner'),true);
insert into public.studio_courses(id,author_id,title) values(current_setting('studio_test.course')::uuid,current_setting('studio_test.owner')::uuid,'Rollback workspace course');
set local role authenticated;
do $$
declare next_revision bigint; affected integer; blocked boolean := false;
begin
  insert into public.studio_workspace_drafts(id,course_id,state) values(current_setting('studio_test.project')::uuid,current_setting('studio_test.course')::uuid,'{"title":"Draft one"}');
  update public.studio_workspace_drafts set state='{"title":"Draft two"}' where id=current_setting('studio_test.project')::uuid and revision=1 returning revision into next_revision;
  if next_revision <> 2 then raise exception 'Revision was not incremented'; end if;
  update public.studio_workspace_drafts set state='{"title":"Stale overwrite"}' where id=current_setting('studio_test.project')::uuid and revision=1;
  get diagnostics affected = row_count;
  if affected <> 0 then raise exception 'Stale write replaced saved work'; end if;
  if not exists(select 1 from public.studio_workspace_drafts where id=current_setting('studio_test.project')::uuid and state->>'title'='Draft two') then raise exception 'Saved work lost'; end if;
  begin update public.studio_workspace_drafts set author_id=gen_random_uuid() where id=current_setting('studio_test.project')::uuid;
  exception when insufficient_privilege then blocked := true; end;
  if not blocked then raise exception 'Workspace identity was mutable'; end if;
  perform set_config('request.jwt.claim.sub',gen_random_uuid()::text,true);
  if exists(select 1 from public.studio_workspace_drafts where id=current_setting('studio_test.project')::uuid) then raise exception 'Private workspace visible to another identity'; end if;
  update public.studio_workspace_drafts set state='{"title":"Foreign overwrite"}' where id=current_setting('studio_test.project')::uuid;
  get diagnostics affected = row_count;
  if affected <> 0 then raise exception 'Foreign workspace write allowed'; end if;
end;
$$;
reset role;
set local role anon;
do $$ declare blocked boolean := false; begin
  begin perform 1 from public.studio_workspace_drafts;
  exception when insufficient_privilege then blocked := true; end;
  if not blocked then raise exception 'Anonymous workspace access allowed'; end if;
end; $$;
reset role;
select 'PASS: owner-only RLS, anonymous denial, revision checks and immutable identity' as result;
rollback;
