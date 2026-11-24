-- Admin CRUD for organizations: rename and delete, alongside the existing
-- save_organization (create) and admin_set_organization_parent RPCs.

create or replace function public.admin_rename_organization(_organization uuid, _name text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.has_role(auth.uid(), 'admin') then
    raise exception 'Administrator access required.';
  end if;
  if trim(_name) = '' then
    raise exception 'Give this organization a name.';
  end if;
  update public.organizations set name = trim(_name), version = version + 1 where id = _organization;
  if not found then
    raise exception 'Organization not found.';
  end if;
end;
$$;

create or replace function public.admin_delete_organization(_organization uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.has_role(auth.uid(), 'admin') then
    raise exception 'Administrator access required.';
  end if;
  if exists (select 1 from public.organizations where parent_id = _organization) then
    raise exception 'Reassign or delete this organization''s child organizations first.';
  end if;
  delete from public.organization_members where organization_id = _organization;
  delete from public.organizations where id = _organization;
  if not found then
    raise exception 'Organization not found.';
  end if;
end;
$$;

grant execute on function public.admin_rename_organization(uuid, text) to authenticated;
grant execute on function public.admin_delete_organization(uuid) to authenticated;
