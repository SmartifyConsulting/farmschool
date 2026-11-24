-- Course-less content library storage: files uploaded via the admin Library > Content tab
-- that are NOT tied to any specific course (distinct from studio_content_files, which requires one).
create table if not exists public.content_library_files (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null references auth.users(id) on delete cascade,
  file_name text not null,
  original_file_name text not null,
  file_type text not null,
  storage_path text not null,
  size_bytes bigint not null,
  description text not null default '',
  classification text not null default '',
  keywords text[] not null default '{}',
  file_hash text,
  created_at timestamptz not null default now()
);

alter table public.content_library_files enable row level security;

create policy "Authors manage their own library files"
  on public.content_library_files
  for all
  using (author_id = auth.uid())
  with check (author_id = auth.uid());
