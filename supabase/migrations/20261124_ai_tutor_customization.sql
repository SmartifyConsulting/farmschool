-- Per-course AI Tutor customization: a trainer-chosen name, custom instructions, a welcome
-- message shown as the tutor's first turn, and a custom icon instead of the generic chat icon.
alter table public.studio_courses
  add column if not exists ai_tutor_name text,
  add column if not exists ai_tutor_instructions text,
  add column if not exists ai_tutor_welcome text,
  add column if not exists ai_tutor_icon_url text;
