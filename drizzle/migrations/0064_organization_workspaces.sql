BEGIN;
CREATE TABLE public.organizations (
  id uuid PRIMARY KEY, owner_id uuid NOT NULL, name text NOT NULL CHECK(char_length(btrim(name)) BETWEEN 2 AND 200),
  welcome text NOT NULL DEFAULT '' CHECK(char_length(welcome)<=5000), brand_color text NOT NULL DEFAULT '#2765BC' CHECK(brand_color ~ '^#[0-9a-fA-F]{6}$'),
  logo_url text CHECK(logo_url IS NULL OR (logo_url ~ '^https://' AND char_length(logo_url)<=2000)), version integer NOT NULL DEFAULT 1
);
CREATE TABLE public.organization_departments (
  id uuid PRIMARY KEY, organization_id uuid NOT NULL REFERENCES public.organizations(id), name text NOT NULL CHECK(char_length(btrim(name)) BETWEEN 1 AND 200),
  parent_id uuid, version integer NOT NULL DEFAULT 1, UNIQUE(organization_id,id),
  FOREIGN KEY(organization_id,parent_id) REFERENCES public.organization_departments(organization_id,id), CHECK(parent_id IS NULL OR parent_id<>id)
);
CREATE TABLE public.organization_members (
  organization_id uuid NOT NULL REFERENCES public.organizations(id), user_id uuid NOT NULL, role text NOT NULL CHECK(role IN('manager','learner')),
  department_id uuid, manager_id uuid, job_title text NOT NULL DEFAULT '' CHECK(char_length(job_title)<=200), version integer NOT NULL DEFAULT 1,
  joined_at timestamptz NOT NULL DEFAULT clock_timestamp(), PRIMARY KEY(organization_id,user_id),
  FOREIGN KEY(organization_id,department_id) REFERENCES public.organization_departments(organization_id,id), CHECK(manager_id IS NULL OR manager_id<>user_id)
);
ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.organization_departments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.organization_members ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.organizations,public.organization_departments,public.organization_members FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.organizations,public.organization_departments,public.organization_members TO authenticated;
GRANT ALL ON public.organizations,public.organization_departments,public.organization_members TO service_role;
CREATE FUNCTION public.organization_access(_organization uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
  SELECT auth.uid() IS NOT NULL AND (EXISTS(SELECT 1 FROM public.organizations WHERE id=_organization AND owner_id=auth.uid())
    OR EXISTS(SELECT 1 FROM public.organization_members WHERE organization_id=_organization AND user_id=auth.uid()))
$$;
CREATE FUNCTION public.organization_manage(_organization uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
  SELECT auth.uid() IS NOT NULL AND (EXISTS(SELECT 1 FROM public.organizations WHERE id=_organization AND owner_id=auth.uid())
    OR EXISTS(SELECT 1 FROM public.organization_members WHERE organization_id=_organization AND user_id=auth.uid() AND role='manager'))
$$;
REVOKE ALL ON FUNCTION public.organization_access(uuid),public.organization_manage(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.organization_access(uuid),public.organization_manage(uuid) TO authenticated;
CREATE POLICY organizations_member_read ON public.organizations FOR SELECT TO authenticated USING(public.organization_access(id));
CREATE POLICY departments_member_read ON public.organization_departments FOR SELECT TO authenticated USING(public.organization_access(organization_id));
CREATE POLICY organization_members_scoped_read ON public.organization_members FOR SELECT TO authenticated USING(user_id=auth.uid() OR public.organization_manage(organization_id));

CREATE FUNCTION public.save_organization(_organization uuid,_name text,_welcome text,_color text,_logo text,_expected integer)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE previous public.organizations; result integer;
BEGIN
  IF auth.uid() IS NULL OR _organization IS NULL THEN RAISE EXCEPTION 'Sign in to manage organizations'; END IF;
  IF _name IS NULL OR char_length(btrim(_name)) NOT BETWEEN 2 AND 200 OR _welcome IS NULL OR char_length(_welcome)>5000
    OR _color IS NULL OR _color !~ '^#[0-9a-fA-F]{6}$' OR (_logo IS NOT NULL AND (_logo !~ '^https://' OR char_length(_logo)>2000)) THEN RAISE EXCEPTION 'Give valid organization branding and a secure logo address'; END IF;
  SELECT * INTO previous FROM public.organizations WHERE id=_organization FOR UPDATE;
  IF FOUND THEN
    IF NOT public.organization_manage(_organization) OR previous.version IS DISTINCT FROM _expected THEN RAISE EXCEPTION 'Organization changed or you lack management access'; END IF;
    UPDATE public.organizations SET name=btrim(_name),welcome=_welcome,brand_color=_color,logo_url=_logo,version=version+1 WHERE id=_organization RETURNING version INTO result;
  ELSE
    IF NOT public.has_role(auth.uid(),'admin') OR _expected IS DISTINCT FROM 0 THEN RAISE EXCEPTION 'Only platform administrators can create organizations'; END IF;
    INSERT INTO public.organizations(id,owner_id,name,welcome,brand_color,logo_url) VALUES(_organization,auth.uid(),btrim(_name),_welcome,_color,_logo);
    INSERT INTO public.organization_members(organization_id,user_id,role) VALUES(_organization,auth.uid(),'manager'); result:=1;
  END IF;
  INSERT INTO public.audit_events(actor_id,action,entity_type,entity_id,metadata) VALUES(auth.uid(),'organization.settings_saved','organization',_organization::text,jsonb_build_object('version',result));
  RETURN result;
END;
$$;
CREATE FUNCTION public.save_organization_department(_organization uuid,_department uuid,_name text,_parent uuid,_expected integer)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE existing public.organization_departments; result integer; cyclic boolean; depth integer; height integer;
BEGIN
  PERFORM 1 FROM public.organizations WHERE id=_organization FOR UPDATE;
  IF NOT FOUND OR NOT public.organization_manage(_organization) THEN RAISE EXCEPTION 'Organization management access required'; END IF;
  IF _department IS NULL OR _name IS NULL OR char_length(btrim(_name)) NOT BETWEEN 1 AND 200 THEN RAISE EXCEPTION 'Give a department name'; END IF;
  IF _parent IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.organization_departments WHERE organization_id=_organization AND id=_parent) THEN RAISE EXCEPTION 'Choose a parent in this organization'; END IF;
  WITH RECURSIVE ancestors AS (
    SELECT id,parent_id,1 AS n FROM public.organization_departments WHERE organization_id=_organization AND id=_parent
    UNION ALL SELECT d.id,d.parent_id,a.n+1 FROM public.organization_departments d JOIN ancestors a ON d.id=a.parent_id WHERE d.organization_id=_organization AND a.n<=32
  ) SELECT coalesce(bool_or(id=_department),false),coalesce(max(n),0) INTO cyclic,depth FROM ancestors;
  IF _department=_parent OR cyclic OR depth>=32 THEN RAISE EXCEPTION 'Department hierarchy would contain a cycle or exceed 32 levels'; END IF;
  WITH RECURSIVE descendants AS (
    SELECT id,1 AS n FROM public.organization_departments WHERE organization_id=_organization AND id=_department
    UNION ALL SELECT d.id,a.n+1 FROM public.organization_departments d JOIN descendants a ON d.parent_id=a.id WHERE d.organization_id=_organization AND a.n<=32
  ) SELECT coalesce(max(n),1) INTO height FROM descendants;
  IF depth+height>32 THEN RAISE EXCEPTION 'Department hierarchy would exceed 32 levels'; END IF;
  SELECT * INTO existing FROM public.organization_departments WHERE id=_department FOR UPDATE;
  IF FOUND THEN
    IF existing.organization_id<>_organization OR existing.version IS DISTINCT FROM _expected THEN RAISE EXCEPTION 'Department changed. Refresh before saving'; END IF;
    UPDATE public.organization_departments SET name=btrim(_name),parent_id=_parent,version=version+1 WHERE id=_department RETURNING version INTO result;
  ELSE
    IF _expected IS DISTINCT FROM 0 THEN RAISE EXCEPTION 'Department not found'; END IF;
    INSERT INTO public.organization_departments(id,organization_id,name,parent_id) VALUES(_department,_organization,btrim(_name),_parent); result:=1;
  END IF;
  INSERT INTO public.audit_events(actor_id,action,entity_type,entity_id,metadata) VALUES(auth.uid(),'organization.department_saved','organization',_organization::text,jsonb_build_object('department_id',_department,'parent_id',_parent,'version',result));
  RETURN result;
END;
$$;
CREATE FUNCTION public.set_organization_member(_organization uuid,_email text,_role text,_department uuid,_manager uuid,_job text,_expected integer)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE person uuid; existing public.organization_members; owner_ref uuid; cyclic boolean; depth integer; height integer;
BEGIN
  SELECT owner_id INTO owner_ref FROM public.organizations WHERE id=_organization FOR UPDATE;
  IF NOT FOUND OR NOT public.organization_manage(_organization) THEN RAISE EXCEPTION 'Organization management access required'; END IF;
  IF _email IS NULL OR char_length(_email)>320 OR _role IS NULL OR _role NOT IN('manager','learner') OR _job IS NULL OR char_length(_job)>200 THEN RAISE EXCEPTION 'Choose a registered member and valid organization role'; END IF;
  SELECT id INTO person FROM auth.users WHERE lower(email)=lower(btrim(_email));
  IF person IS NULL THEN RAISE EXCEPTION 'No registered account matches that email address'; END IF;
  IF person=owner_ref AND auth.uid()<>owner_ref THEN RAISE EXCEPTION 'Only the organization owner can change their own directory record'; END IF;
  IF _department IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.organization_departments WHERE id=_department AND organization_id=_organization) THEN RAISE EXCEPTION 'Choose a department in this organization'; END IF;
  IF _manager IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.organization_members WHERE organization_id=_organization AND user_id=_manager) THEN RAISE EXCEPTION 'Choose a reporting manager in this organization'; END IF;
  WITH RECURSIVE ancestors AS (
    SELECT user_id,manager_id,1 AS n FROM public.organization_members WHERE organization_id=_organization AND user_id=_manager
    UNION ALL SELECT m.user_id,m.manager_id,a.n+1 FROM public.organization_members m JOIN ancestors a ON m.user_id=a.manager_id WHERE m.organization_id=_organization AND a.n<=32
  ) SELECT coalesce(bool_or(user_id=person),false),coalesce(max(n),0) INTO cyclic,depth FROM ancestors;
  IF person=_manager OR cyclic OR depth>=32 THEN RAISE EXCEPTION 'Reporting hierarchy would contain a cycle or exceed 32 levels'; END IF;
  WITH RECURSIVE descendants AS (
    SELECT user_id,1 AS n FROM public.organization_members WHERE organization_id=_organization AND user_id=person
    UNION ALL SELECT m.user_id,a.n+1 FROM public.organization_members m JOIN descendants a ON m.manager_id=a.user_id WHERE m.organization_id=_organization AND a.n<=32
  ) SELECT coalesce(max(n),1) INTO height FROM descendants;
  IF depth+height>32 THEN RAISE EXCEPTION 'Reporting hierarchy would exceed 32 levels'; END IF;
  SELECT * INTO existing FROM public.organization_members WHERE organization_id=_organization AND user_id=person FOR UPDATE;
  IF coalesce(existing.version,0) IS DISTINCT FROM _expected THEN RAISE EXCEPTION 'Member changed. Refresh before saving'; END IF;
  IF person=auth.uid() AND auth.uid()<>owner_ref AND _role<>existing.role THEN RAISE EXCEPTION 'Ask another manager to change your own role'; END IF;
  INSERT INTO public.organization_members(organization_id,user_id,role,department_id,manager_id,job_title) VALUES(_organization,person,_role,_department,_manager,_job)
    ON CONFLICT(organization_id,user_id) DO UPDATE SET role=excluded.role,department_id=excluded.department_id,manager_id=excluded.manager_id,job_title=excluded.job_title,version=organization_members.version+1;
  INSERT INTO public.audit_events(actor_id,action,entity_type,entity_id,metadata) VALUES(auth.uid(),'organization.member_saved','organization',_organization::text,jsonb_build_object('user_id',person,'role',_role,'department_id',_department,'manager_id',_manager));
  RETURN person;
END;
$$;
CREATE FUNCTION public.remove_organization_member(_organization uuid,_user uuid,_expected integer)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE owner_ref uuid;
BEGIN
  SELECT owner_id INTO owner_ref FROM public.organizations WHERE id=_organization FOR UPDATE;
  IF NOT FOUND OR NOT public.organization_manage(_organization) OR _user=owner_ref OR _user=auth.uid() THEN RAISE EXCEPTION 'A manager can remove other members but cannot remove the organization owner or themselves'; END IF;
  PERFORM 1 FROM public.organization_members WHERE organization_id=_organization AND user_id=_user AND version=_expected FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Member changed. Refresh before removing'; END IF;
  UPDATE public.organization_members SET manager_id=NULL,version=version+1 WHERE organization_id=_organization AND manager_id=_user;
  DELETE FROM public.organization_members WHERE organization_id=_organization AND user_id=_user;
  INSERT INTO public.audit_events(actor_id,action,entity_type,entity_id,metadata) VALUES(auth.uid(),'organization.member_removed','organization',_organization::text,jsonb_build_object('user_id',_user));
END;
$$;
CREATE FUNCTION public.my_organizations()
RETURNS TABLE(id uuid,name text,welcome text,brand_color text,logo_url text,version integer,can_manage boolean)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
  SELECT o.id,o.name,o.welcome,o.brand_color,o.logo_url,o.version,public.organization_manage(o.id) FROM public.organizations o WHERE public.organization_access(o.id)
$$;
CREATE FUNCTION public.organization_people(_organization uuid)
RETURNS TABLE(user_id uuid,full_name text,email text,role text,department_id uuid,manager_id uuid,job_title text,manager_name text,is_owner boolean,version integer)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
  SELECT m.user_id,coalesce(nullif(p.full_name,''),'Learner'),u.email::text,m.role,m.department_id,m.manager_id,m.job_title,coalesce(mp.full_name,''),m.user_id=o.owner_id,m.version
  FROM public.organization_members m JOIN public.organizations o ON o.id=m.organization_id JOIN auth.users u ON u.id=m.user_id LEFT JOIN public.profiles p ON p.user_id=m.user_id LEFT JOIN public.profiles mp ON mp.user_id=m.manager_id
  WHERE m.organization_id=_organization AND public.organization_access(_organization) AND (m.user_id=auth.uid() OR public.organization_manage(_organization))
$$;
REVOKE ALL ON FUNCTION public.save_organization(uuid,text,text,text,text,integer),public.save_organization_department(uuid,uuid,text,uuid,integer),public.set_organization_member(uuid,text,text,uuid,uuid,text,integer),public.remove_organization_member(uuid,uuid,integer),public.my_organizations(),public.organization_people(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.save_organization(uuid,text,text,text,text,integer),public.save_organization_department(uuid,uuid,text,uuid,integer),public.set_organization_member(uuid,text,text,uuid,uuid,text,integer),public.remove_organization_member(uuid,uuid,integer),public.my_organizations(),public.organization_people(uuid) TO authenticated;
COMMIT;
