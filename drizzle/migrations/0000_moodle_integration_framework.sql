create type public.app_role as enum ('admin', 'user');
create table public.user_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  role public.app_role not null,
  unique (user_id, role)
);
grant select on public.user_roles to authenticated;
grant all on public.user_roles to service_role;
alter table public.user_roles enable row level security;
create policy "read own roles" on public.user_roles for select to authenticated using (auth.uid() = user_id);

create or replace function public.has_role(_user_id uuid, _role public.app_role)
returns boolean language sql stable security definer set search_path = public
as $$ select exists (select 1 from public.user_roles where user_id = _user_id and role = _role) $$;

create table public.moodle_settings (
  id int primary key default 1 check (id = 1),
  base_url text not null default '',
  enabled boolean not null default false,
  status text not null default 'not_configured',
  site_name text,
  last_tested_at timestamptz,
  last_sync_at timestamptz,
  last_error text,
  updated_at timestamptz not null default now()
);
insert into public.moodle_settings (id) values (1);
grant select, update on public.moodle_settings to authenticated;
grant all on public.moodle_settings to service_role;
alter table public.moodle_settings enable row level security;
create policy "admins read settings" on public.moodle_settings for select to authenticated using (public.has_role(auth.uid(), 'admin'));
create policy "admins update settings" on public.moodle_settings for update to authenticated using (public.has_role(auth.uid(), 'admin')) with check (public.has_role(auth.uid(), 'admin'));

create table public.moodle_courses (
  moodle_id int primary key,
  title text not null,
  summary text not null default '',
  category text not null default '',
  image_url text,
  visible boolean not null default true,
  synced_at timestamptz not null default now()
);
grant select on public.moodle_courses to anon, authenticated;
grant all on public.moodle_courses to service_role;
alter table public.moodle_courses enable row level security;
create policy "public read visible courses" on public.moodle_courses for select to anon, authenticated using (visible);

create table public.moodle_sync_log (
  id uuid primary key default gen_random_uuid(),
  action text not null,
  ok boolean not null,
  message text not null default '',
  created_at timestamptz not null default now()
);
grant select on public.moodle_sync_log to authenticated;
grant all on public.moodle_sync_log to service_role;
alter table public.moodle_sync_log enable row level security;
create policy "admins read log" on public.moodle_sync_log for select to authenticated using (public.has_role(auth.uid(), 'admin'));