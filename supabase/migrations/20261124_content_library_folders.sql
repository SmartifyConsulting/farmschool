-- Folders for the course-less Content Library (content_library_files), mirroring
-- studio_course_folders so trainers can organise standalone uploaded files.
create table if not exists public.content_library_folders (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null references auth.users(id) on delete cascade,
  parent_id uuid references public.content_library_folders(id) on delete cascade,
  name text not null,
  created_at timestamptz not null default now()
);

alter table public.content_library_folders enable row level security;

create policy "Authors manage their own content library folders"
  on public.content_library_folders
  for all
  using (author_id = auth.uid())
  with check (author_id = auth.uid());

alter table public.content_library_files
  add column if not exists folder_id uuid references public.content_library_folders(id) on delete set null;
