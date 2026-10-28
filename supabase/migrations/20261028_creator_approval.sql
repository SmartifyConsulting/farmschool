-- Creator vetting foundation. Existing published courses remain unchanged.
create table if not exists public.creator_applications (
  user_id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null check (char_length(trim(display_name)) between 3 and 120),
  expertise text not null check (char_length(trim(expertise)) between 10 and 2000),
  industry text not null check (char_length(trim(industry)) between 2 and 80),
  status text not null default 'pending' check (status in ('pending','approved','rejected')),
  submitted_at timestamptz not null default now(),
  reviewed_at timestamptz,
  reviewed_by uuid references auth.users(id),
  review_notes text
);
alter table public.creator_applications enable row level security;
create policy "creators read own application" on public.creator_applications
  for select to authenticated using (user_id = (select auth.uid()));
create policy "admins read creator applications" on public.creator_applications
  for select to authenticated using (public.has_role((select auth.uid()), 'admin'));
create policy "creators submit own application" on public.creator_applications
  for insert to authenticated with check (
    user_id = (select auth.uid()) and status = 'pending'
    and reviewed_at is null and reviewed_by is null and review_notes is null
  );
-- Creator cannot change approval status or review decisions through client writes.
create or replace function public.creator_submit_application(
  _display_name text, _expertise text, _industry text
) returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'Sign in required'; end if;
  if length(trim(_display_name)) not between 3 and 120
     or length(trim(_expertise)) not between 10 and 2000
     or length(trim(_industry)) not between 2 and 80 then
    raise exception 'Complete the creator application fields'; end if;
  insert into public.creator_applications(user_id,display_name,expertise,industry)
    values (auth.uid(),trim(_display_name),trim(_expertise),trim(_industry))
    on conflict (user_id) do update
      set display_name=excluded.display_name, expertise=excluded.expertise,
          industry=excluded.industry, submitted_at=now()
    where creator_applications.status = 'rejected';
  if not found then raise exception 'An application is already pending or approved'; end if;
end $$;
revoke all on function public.creator_submit_application(text,text,text) from public;
grant execute on function public.creator_submit_application(text,text,text) to authenticated;

create or replace function public.creator_review_application(
  _user_id uuid, _approve boolean, _notes text default null
) returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null or not public.has_role(auth.uid(),'admin') then
    raise exception 'Administrator permission required'; end if;
  update public.creator_applications
    set status = case when _approve then 'approved' else 'rejected' end,
        reviewed_at=now(), reviewed_by=auth.uid(), review_notes=left(coalesce(_notes,''),2000)
    where user_id=_user_id and status='pending';
  if not found then raise exception 'Pending application not found'; end if;
end $$;
revoke all on function public.creator_review_application(uuid,boolean,text) from public;
grant execute on function public.creator_review_application(uuid,boolean,text) to authenticated;

create or replace function public.creator_enforce_publish_approval()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.published and (tg_op = 'INSERT' or not old.published) then
    if not exists (
      select 1 from public.creator_applications
      where user_id=new.author_id and status='approved'
    ) then
      raise exception 'Creator approval is required before publishing';
    end if;
  end if;
  return new;
end $$;
drop trigger if exists creator_publish_approval_gate on public.studio_courses;
create trigger creator_publish_approval_gate before insert or update of published on public.studio_courses
for each row execute function public.creator_enforce_publish_approval();
