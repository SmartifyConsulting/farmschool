-- Run after 20261127_admin_organization_repairs.sql using a privileged SQL session.
-- Every fixture, audit event and change is rolled back, including successful deletion.
begin;
do $$
declare
  admin_id uuid;
  org_id uuid := gen_random_uuid();
  second_org uuid := gen_random_uuid();
  child_org uuid := gen_random_uuid();
  dept_id uuid := gen_random_uuid();
  resource_id uuid;
  old_slug text := 'repair-' || replace(org_id::text, '-', '');
  new_slug text := 'renamed-' || replace(org_id::text, '-', '');
  reserved_slug text := 'reserved-' || replace(org_id::text, '-', '');
  response jsonb;
  blocked boolean;
  invalid_slug text;
begin
  select user_id into admin_id from public.user_roles where role = 'admin' limit 1;
  if admin_id is null then raise exception 'Test requires an existing administrator.'; end if;
  insert into public.organizations(id, owner_id, name) values
    (org_id, admin_id, 'Rollback repair fixture'), (second_org, admin_id, 'Rollback reserved fixture');
  insert into public.organization_portals(organization_id, slug, enabled, agriculture_only, public_message)
    values (org_id, old_slug, true, true, 'Keep this welcome'), (second_org, reserved_slug, false, false, 'Other welcome');

  -- Missing identity and an unprivileged identity must fail every Admin RPC.
  foreach invalid_slug in array array['', gen_random_uuid()::text] loop
    perform set_config('request.jwt.claim.sub', invalid_slug, true);
    blocked := false;
    begin perform public.admin_organization_portal_settings(org_id);
    exception when raise_exception then if sqlerrm = 'Administrator access required.' then blocked := true; else raise; end if; end;
    if not blocked then raise exception 'Read allowed without admin'; end if;
    blocked := false;
    begin perform public.admin_change_organization_portal_path(org_id, new_slug, 1);
    exception when raise_exception then if sqlerrm = 'Administrator access required.' then blocked := true; else raise; end if; end;
    if not blocked then raise exception 'Path edit allowed without admin'; end if;
    blocked := false;
    begin perform public.admin_delete_organization(org_id);
    exception when raise_exception then if sqlerrm = 'Administrator access required.' then blocked := true; else raise; end if; end;
    if not blocked then raise exception 'Deletion allowed without admin'; end if;
  end loop;
  if has_function_privilege('anon', 'public.admin_change_organization_portal_path(uuid,text,integer)', 'execute')
    or has_function_privilege('anon', 'public.admin_delete_organization(uuid)', 'execute')
    or has_function_privilege('anon', 'public.admin_organization_portal_settings(uuid)', 'execute') then
    raise exception 'Anonymous execution grant remains';
  end if;
  perform set_config('request.jwt.claim.sub', admin_id::text, true);
  response := public.admin_organization_portal_settings(org_id);
  if response->>'slug' <> old_slug then raise exception 'Wrong portal returned'; end if;

  foreach invalid_slug in array array['admin', '../auth', 'https://other.example', 'a', reserved_slug] loop
    blocked := false;
    begin perform public.admin_change_organization_portal_path(org_id, invalid_slug, 1);
    exception when raise_exception then if sqlerrm in ('Choose a valid portal address.', 'This portal address is already reserved.') then blocked := true; else raise; end if; end;
    if not blocked then raise exception 'Invalid or reserved address accepted'; end if;
  end loop;
  if public.admin_change_organization_portal_path(org_id, new_slug, 1) <> 2 then raise exception 'Version not incremented'; end if;
  if not exists (select 1 from public.organization_portals where organization_id = org_id and slug = new_slug
    and enabled and agriculture_only and public_message = 'Keep this welcome') then raise exception 'Portal scope or content changed'; end if;
  blocked := false;
  begin perform public.admin_change_organization_portal_path(org_id, old_slug, 1);
  exception when raise_exception then if sqlerrm = 'Portal settings changed. Refresh before saving.' then blocked := true; else raise; end if; end;
  if not blocked then raise exception 'Stale write accepted'; end if;
  if public.admin_change_organization_portal_path(org_id, new_slug, 2) <> 2 then raise exception 'No-op changed version'; end if;
  if not exists (select 1 from public.audit_events where entity_id = org_id::text and action = 'organization.portal_path_changed') then raise exception 'Missing path audit'; end if;

  insert into public.organizations(id, owner_id, name, parent_id) values(child_org, admin_id, 'Rollback child', org_id);
  blocked := false;
  begin perform public.admin_delete_organization(org_id);
  exception when raise_exception then if sqlerrm like 'Reassign or delete%' then blocked := true; else raise; end if; end;
  if not blocked then raise exception 'Child organization not protected'; end if;
  delete from public.organizations where id = child_org;

  insert into public.studio_courses(title) values('Rollback course fixture') returning id into resource_id;
  insert into public.organization_courses(course_id, organization_id) values(resource_id, org_id);
  blocked := false;
  begin perform public.admin_delete_organization(org_id);
  exception when raise_exception then if sqlerrm like 'This organization has linked courses.%' then blocked := true; else raise; end if; end;
  if not blocked then raise exception 'Course links not protected'; end if;
  delete from public.organization_courses where organization_id = org_id;

  insert into public.cohorts(name) values('Rollback cohort fixture') returning id into resource_id;
  insert into public.organization_cohorts(cohort_id, organization_id) values(resource_id, org_id);
  blocked := false;
  begin perform public.admin_delete_organization(org_id);
  exception when raise_exception then if sqlerrm like 'This organization has linked cohorts.%' then blocked := true; else raise; end if; end;
  if not blocked then raise exception 'Cohort links not protected'; end if;
  delete from public.organization_cohorts where organization_id = org_id;

  resource_id := gen_random_uuid();
  insert into public.learning_programs(id, owner_id, title) values(resource_id, admin_id, 'Rollback programme fixture');
  insert into public.organization_programs(program_id, organization_id) values(resource_id, org_id);
  blocked := false;
  begin perform public.admin_delete_organization(org_id);
  exception when raise_exception then if sqlerrm like 'This organization has linked programmes.%' then blocked := true; else raise; end if; end;
  if not blocked then raise exception 'Programme links not protected'; end if;
  delete from public.organization_programs where organization_id = org_id;

  -- Roll back this subtransaction rather than deleting an immutable award snapshot.
  begin
    insert into public.certificates(user_id, source, course_ref, title) values(admin_id, 'catalogue', org_id::text, 'Rollback award fixture') returning id into resource_id;
    insert into public.certificate_brand_snapshots(certificate_id, organization_id, issuer_name, color, heading, signatory_name, signatory_title, footer, template_version)
      values(resource_id, org_id, 'Rollback fixture', '#2765BC', 'Certificate', '', '', '', 1);
    blocked := false;
    begin perform public.admin_delete_organization(org_id);
    exception when raise_exception then if sqlerrm like 'This organization has issued certificates%' then blocked := true; else raise; end if; end;
    if not blocked then raise exception 'Issued certificates not protected'; end if;
    raise sqlstate 'PT001' using message = 'Rollback award fixture';
  exception when sqlstate 'PT001' then null;
  end;

  insert into public.organization_departments(id, organization_id, name) values(dept_id, org_id, 'Parent department');
  insert into public.organization_departments(id, organization_id, parent_id, name) values(gen_random_uuid(), org_id, dept_id, 'Child department');
  insert into public.organization_members(organization_id, user_id, role, department_id) values(org_id, admin_id, 'manager', dept_id);
  insert into public.organization_certificate_settings(organization_id) values(org_id);
  insert into public.organization_notification_rules(organization_id, title, department_id, changed_by) values(org_id, 'Rollback rule', dept_id, admin_id);
  insert into public.organization_notifications(organization_id, user_id, title) values(org_id, admin_id, 'Rollback notification');
  perform public.admin_delete_organization(org_id);
  if exists (select 1 from public.organizations where id = org_id)
    or exists (select 1 from public.organization_members where organization_id = org_id)
    or exists (select 1 from public.organization_departments where organization_id = org_id)
    or exists (select 1 from public.organization_portals where organization_id = org_id)
    or exists (select 1 from public.organization_certificate_settings where organization_id = org_id)
    or exists (select 1 from public.organization_notification_rules where organization_id = org_id)
    or exists (select 1 from public.organization_notifications where organization_id = org_id) then raise exception 'Unused workspace cleanup incomplete'; end if;
  if not exists (select 1 from public.audit_events where entity_id = org_id::text and action = 'organization.deleted') then raise exception 'Missing deletion audit'; end if;
end;
$$;
select 'PASS: permissions, path validation, duplicates, stale writes, scope preservation, protected records, deletion cleanup and audits' as result;
rollback;
