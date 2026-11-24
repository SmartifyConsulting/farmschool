-- Lets a trainer organize their own courses into folders (with simple one-level-at-a-time nesting),
-- Explorer-style: rename, delete, move folders and courses, and a root view with no folder.
create table if not exists public.studio_course_folders (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null references auth.users(id) on delete cascade,
  parent_id uuid references public.studio_course_folders(id) on delete cascade,
  name text not null,
  created_at timestamptz not null default now()
);

alter table public.studio_course_folders enable row level security;

create policy "Authors manage their own course folders"
  on public.studio_course_folders
  for all
  using (author_id = auth.uid())
  with check (author_id = auth.uid());

-- A course with no folder_id sits in the root view. Deleting a folder moves its courses back to
-- root rather than deleting them.
alter table public.studio_courses
  add column if not exists folder_id uuid references public.studio_course_folders(id) on delete set null;
