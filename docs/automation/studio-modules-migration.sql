-- Persisted course modules, replacing title-regex grouping.
create table if not exists studio_modules (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references studio_courses(id) on delete cascade,
  title text not null,
  position integer not null default 0,
  created_at timestamptz not null default now()
);

alter table studio_lessons add column if not exists module_id uuid references studio_modules(id) on delete set null;

alter table studio_modules enable row level security;

drop policy if exists "Owners manage their course modules" on studio_modules;
create policy "Owners manage their course modules"
on studio_modules for all
to authenticated
using (exists (select 1 from studio_courses c where c.id = studio_modules.course_id and c.author_id = auth.uid()))
with check (exists (select 1 from studio_courses c where c.id = studio_modules.course_id and c.author_id = auth.uid()));

drop policy if exists "Learners read modules of published courses" on studio_modules;
create policy "Learners read modules of published courses"
on studio_modules for select
to authenticated, anon
using (exists (select 1 from studio_courses c where c.id = studio_modules.course_id and c.published = true));
