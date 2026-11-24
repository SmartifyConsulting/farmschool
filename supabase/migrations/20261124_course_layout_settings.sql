-- Per-course layout: full width, content width percentage, content alignment and spacing.
alter table public.studio_courses
  add column if not exists layout_settings jsonb not null default '{}'::jsonb;
