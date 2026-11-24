-- Per-course color customization beyond the fixed 5-swatch accent theme: body text, link, banner
-- background/text, title, page background/text and heading colors. Empty/absent keys fall back to
-- the existing accent theme or site default.
alter table public.studio_courses
  add column if not exists color_overrides jsonb not null default '{}'::jsonb;
