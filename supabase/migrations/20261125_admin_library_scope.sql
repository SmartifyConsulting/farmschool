-- Approved Admin Library placement of the 16 existing course imports.
-- Keep existing course IDs, authors, lessons, progress and publishing safeguards.
begin;
alter table public.studio_courses
 add column if not exists library_scope text not null default 'personal';
alter table public.studio_courses
 add constraint studio_courses_library_scope_check check(library_scope in ('personal','admin'));

-- Existing owner RLS is unchanged. Admin-library courses remain editable only
-- through existing owner checks, and must also be managed by an existing Admin.
create or replace function public.studio_guard_library_scope()
returns trigger language plpgsql security invoker set search_path=public,pg_temp as $$
begin
 if new.library_scope='admin' or (tg_op='UPDATE' and old.library_scope='admin') then
  if current_user not in ('postgres','supabase_admin','service_role')
     and not coalesce(public.has_role(auth.uid(),'admin'),false) then
   raise exception 'Admin access is required to manage Admin Library courses.';
  end if;
 end if;
 if tg_op='UPDATE' and old.library_scope='admin' and new.author_id is distinct from old.author_id then
  raise exception 'Author attribution cannot be changed for an Admin Library course.';
 end if;
 return new;
end $$;
create trigger studio_course_library_scope_guard before insert or update on public.studio_courses
 for each row execute function public.studio_guard_library_scope();

-- Reclassify only the 16 confirmed unpublished imports from 24 November.
-- Any changed course state aborts the whole transaction for another review.
do $$
declare candidates integer; changed integer;
begin
 select count(*) into candidates from public.studio_courses
 where author_id='b2fbef55-f781-49d3-bfc6-8690c8c99ac6'
 and (created_at at time zone 'Africa/Johannesburg')::date=date '2026-11-24'
 and not published and deleted_at is null and library_scope='personal';
 if candidates<>16 then raise exception 'Expected 16 unchanged course drafts; found %.',candidates; end if;
 update public.studio_courses set library_scope='admin'
 where author_id='b2fbef55-f781-49d3-bfc6-8690c8c99ac6'
 and (created_at at time zone 'Africa/Johannesburg')::date=date '2026-11-24'
 and not published and deleted_at is null and library_scope='personal';
 get diagnostics changed=row_count;
 if changed<>16 then raise exception 'Course selection changed during reassignment.'; end if;
end $$;
commit;
