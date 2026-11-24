-- Per-course custom pronunciation dictionary for Listen mode: an array of {term, replacement}
-- pairs substituted into the text fed to speech synthesis only, never shown to the reader.
alter table public.studio_courses
  add column if not exists pronunciation_dictionary jsonb not null default '[]'::jsonb;
