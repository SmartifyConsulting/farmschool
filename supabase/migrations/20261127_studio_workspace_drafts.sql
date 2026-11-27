-- Private working copies; never publishes course content.
begin;
create table public.studio_workspace_drafts (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  course_id uuid references public.studio_courses(id) on delete cascade,
  state jsonb not null default '{}'::jsonb
    check (jsonb_typeof(state) = 'object' and octet_length(state::text) <= 16000000),
  revision bigint not null default 1 check (revision > 0),
  updated_at timestamptz not null default clock_timestamp()
);
create index studio_workspace_drafts_author_updated_idx
  on public.studio_workspace_drafts(author_id, updated_at desc);
alter table public.studio_workspace_drafts enable row level security;
create policy "Authors manage their own studio workspaces"
  on public.studio_workspace_drafts for all to authenticated
  using (author_id = auth.uid())
  with check (author_id = auth.uid() and (course_id is null or exists (
    select 1 from public.studio_courses c
    where c.id = course_id and c.author_id = auth.uid()
  )));
create function public.stamp_studio_workspace_draft()
returns trigger language plpgsql set search_path = '' as $$
begin
  if TG_OP = 'UPDATE' then
    if new.id is distinct from old.id or new.author_id is distinct from old.author_id
      or new.course_id is distinct from old.course_id then
      raise exception 'Workspace identity cannot be changed.';
    end if;
    new.revision := old.revision + 1;
  else
    new.revision := 1;
  end if;
  new.updated_at := clock_timestamp();
  return new;
end;
$$;
create trigger stamp_studio_workspace_draft
  before insert or update on public.studio_workspace_drafts
  for each row execute function public.stamp_studio_workspace_draft();
revoke all on public.studio_workspace_drafts from public, anon, authenticated;
grant select, insert, delete on public.studio_workspace_drafts to authenticated;
grant update(state) on public.studio_workspace_drafts to authenticated;
notify pgrst, 'reload schema';
commit;
-- The client updates state only WHERE id = project_id AND revision = loaded_revision,
-- then reads the returned revision. A zero-row update is a conflict, never success.
-- Published lessons and all publish/review checks remain in their existing code paths.
