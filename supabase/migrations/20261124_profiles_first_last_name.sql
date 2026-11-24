-- Splits the single free-text full_name into distinct first_name/last_name columns, so the avatar
-- and profile can show "First Last" reliably instead of whatever a trainer typed into one box.
alter table public.profiles
  add column if not exists first_name text not null default '',
  add column if not exists last_name text not null default '';

-- Backfill from existing full_name: first word -> first_name, remaining words -> last_name.
update public.profiles
set
  first_name = coalesce(nullif(split_part(trim(full_name), ' ', 1), ''), first_name),
  last_name = coalesce(nullif(trim(substring(trim(full_name) from length(split_part(trim(full_name), ' ', 1)) + 1)), ''), last_name)
where full_name is not null and trim(full_name) <> '';
