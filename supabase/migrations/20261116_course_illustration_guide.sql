-- A course-level reference for AI-illustrated content: the visual style and any recurring
-- narrator/characters, decided once at the start of course design so every lesson's
-- illustrations stay consistent instead of being picked lesson by lesson.
alter table public.studio_courses
  add column if not exists illustration_guide jsonb not null default '{}'::jsonb;
