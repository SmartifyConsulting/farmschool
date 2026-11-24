-- Per-course typography: heading/body font pick (from a curated, safe list) and a text-size
-- density preset (compact/standard/large). Empty/absent keys fall back to the site default.
alter table public.studio_courses
  add column if not exists font_settings jsonb not null default '{}'::jsonb;
