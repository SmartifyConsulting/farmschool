-- Admin-only path edits; retain existing manager permissions and portal scope.
begin;

create or replace function public.admin_organization_portal_settings(_organization uuid)
returns jsonb language plpgsql stable security definer set search_path = ''
as $$
declare result jsonb;
begin
  if auth.uid() is null or not public.has_role(auth.uid(), 'admin') then
    raise exception 'Administrator access required.';
  end if;
  if not exists (select 1 from public.organizations where id = _organization) then
    raise exception 'Organization not found.';
  end if;
  select jsonb_build_object('slug', slug, 'enabled', enabled, 'version', version)
    into result from public.organization_portals where organization_id = _organization;
  return result;
end;
$$;

create or replace function public.admin_change_organization_portal_path(
  _organization uuid, _slug text, _expected integer
)
returns integer language plpgsql security definer set search_path = ''
as $$
declare previous public.organization_portals; result integer;
begin
  if auth.uid() is null or not public.has_role(auth.uid(), 'admin') then
    raise exception 'Administrator access required.';
  end if;
  perform 1 from public.organizations where id = _organization for update;
  if not found then raise exception 'Organization not found.'; end if;
  if _slug is null or _slug !~ '^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$'
    or _slug in ('admin', 'plusticity', 'support', 'login', 'api') then
    raise exception 'Choose a valid portal address.';
  end if;
  select * into previous from public.organization_portals
    where organization_id = _organization for update;
  if not found then raise exception 'Create the portal in workspace Settings first.'; end if;
  if previous.version is distinct from _expected then
    raise exception 'Portal settings changed. Refresh before saving.';
  end if;
  if previous.slug = _slug then return previous.version; end if;
  if exists (select 1 from public.organization_portals where slug = _slug and organization_id <> _organization) then
    raise exception 'This portal address is already reserved.';
  end if;
  update public.organization_portals set slug = _slug, version = version + 1
    where organization_id = _organization returning version into result;
  insert into public.audit_events(actor_id, action, entity_type, entity_id, metadata)
    values(auth.uid(), 'organization.portal_path_changed', 'organization', _organization::text,
      jsonb_build_object('previous_slug', previous.slug, 'slug', _slug, 'version', result));
  return result;
exception when unique_violation then
  raise exception 'This portal address is already reserved.';
end;
$$;

create or replace function public.admin_delete_organization(_organization uuid)
returns void language plpgsql security definer set search_path = ''
as $$
declare organization_name text;
begin
  if auth.uid() is null or not public.has_role(auth.uid(), 'admin') then
    raise exception 'Administrator access required.';
  end if;
  select name into organization_name from public.organizations where id = _organization for update;
  if not found then raise exception 'Organization not found.'; end if;
  if exists (select 1 from public.organizations where parent_id = _organization) then
    raise exception 'Reassign or delete this organization''s child organizations first.';
  end if;
  if exists (select 1 from public.organization_courses where organization_id = _organization) then
    raise exception 'This organization has linked courses. Remove or reassign those links before deleting it.';
  end if;
  if exists (select 1 from public.organization_cohorts where organization_id = _organization) then
    raise exception 'This organization has linked cohorts. Remove or reassign those links before deleting it.';
  end if;
  if exists (select 1 from public.organization_programs where organization_id = _organization) then
    raise exception 'This organization has linked programmes. Remove or reassign those links before deleting it.';
  end if;
  if exists (select 1 from public.certificate_brand_snapshots where organization_id = _organization) then
    raise exception 'This organization has issued certificates and must be retained to preserve their records.';
  end if;
  if exists (select 1 from public.cohort_assignment_rules r join public.organization_departments d
    on d.id = r.department_id where d.organization_id = _organization) then
    raise exception 'This organization has department assignment rules. Remove or reassign those rules before deleting it.';
  end if;
  delete from public.organization_notification_rules where organization_id = _organization;
  delete from public.organization_certificate_settings where organization_id = _organization;
  delete from public.organization_portals where organization_id = _organization;
  delete from public.organization_members where organization_id = _organization;
  update public.organization_departments set parent_id = null where organization_id = _organization;
  delete from public.organization_departments where organization_id = _organization;
  delete from public.organizations where id = _organization;
  insert into public.audit_events(actor_id, action, entity_type, entity_id, metadata)
    values(auth.uid(), 'organization.deleted', 'organization', _organization::text,
      jsonb_build_object('name', organization_name));
exception when foreign_key_violation then
  raise exception 'This organization still has linked records. Remove or reassign them before deleting it.';
end;
$$;

revoke all on function public.admin_organization_portal_settings(uuid) from public, anon;
revoke all on function public.admin_change_organization_portal_path(uuid, text, integer) from public, anon;
revoke all on function public.admin_delete_organization(uuid) from public, anon;
grant execute on function public.admin_organization_portal_settings(uuid) to authenticated;
grant execute on function public.admin_change_organization_portal_path(uuid, text, integer) to authenticated;
grant execute on function public.admin_delete_organization(uuid) to authenticated;
notify pgrst, 'reload schema';
commit;
