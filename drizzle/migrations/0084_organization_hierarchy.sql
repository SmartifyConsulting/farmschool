BEGIN;

-- Organizational hierarchy: read-only rollup only. A parent org's managers
-- can VIEW a descendant org's cohort/progress reports; they get no write
-- access there (organization_manage is intentionally left untouched).
--
-- Safe-by-default: every existing organization already has parent_id = NULL
-- and nothing here changes behavior until a platform admin explicitly links
-- two orgs via admin_set_organization_parent. Until that happens, every
-- function below evaluates exactly as it did before this migration. Treat a
-- freshly created parent/child link as needing a live cross-org isolation
-- check before relying on it in production.

ALTER TABLE public.organizations
  ADD COLUMN parent_id uuid REFERENCES public.organizations(id) ON DELETE SET NULL,
  ADD CONSTRAINT organizations_parent_not_self CHECK (parent_id IS NULL OR parent_id <> id);

CREATE OR REPLACE FUNCTION public.organization_parent_no_cycle() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE _cursor uuid; _depth int := 0;
BEGIN
  IF NEW.parent_id IS NULL THEN RETURN NEW; END IF;
  _cursor := NEW.parent_id;
  WHILE _cursor IS NOT NULL LOOP
    _depth := _depth + 1;
    IF _cursor = NEW.id THEN
      RAISE EXCEPTION 'An organization cannot be its own ancestor.';
    END IF;
    IF _depth > 20 THEN
      RAISE EXCEPTION 'Organization hierarchy is too deep (over 20 levels) — likely a cycle.';
    END IF;
    SELECT parent_id INTO _cursor FROM public.organizations WHERE id = _cursor;
  END LOOP;
  RETURN NEW;
END;
$$;

CREATE TRIGGER organization_parent_no_cycle_trigger
  BEFORE INSERT OR UPDATE OF parent_id ON public.organizations
  FOR EACH ROW EXECUTE FUNCTION public.organization_parent_no_cycle();

-- True if auth.uid() owns or manages a STRICT ancestor of _organization
-- (never _organization itself — that's what organization_access/manage
-- already cover). Bounded to the same 20-level depth as the cycle guard.
CREATE OR REPLACE FUNCTION public.organization_ancestor_manager(_organization uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH RECURSIVE ancestors AS (
    SELECT parent_id, 1 AS depth FROM public.organizations WHERE id = _organization
    UNION ALL
    SELECT o.parent_id, a.depth + 1
    FROM public.organizations o JOIN ancestors a ON o.id = a.parent_id
    WHERE a.depth < 20
  )
  SELECT auth.uid() IS NOT NULL AND EXISTS (
    SELECT 1 FROM ancestors a
    JOIN public.organizations o ON o.id = a.parent_id
    WHERE a.parent_id IS NOT NULL
      AND (
        o.owner_id = auth.uid()
        OR EXISTS (
          SELECT 1 FROM public.organization_members m
          WHERE m.organization_id = o.id AND m.user_id = auth.uid() AND m.role = 'manager'
        )
      )
  );
$$;
REVOKE ALL ON FUNCTION public.organization_ancestor_manager(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.organization_ancestor_manager(uuid) TO authenticated;

-- Read boundary: additive only — every prior condition is unchanged, this
-- only adds "or you manage an ancestor org" as a new OR branch.
CREATE OR REPLACE FUNCTION public.organization_access(_organization uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT auth.uid() IS NOT NULL AND (
    EXISTS (SELECT 1 FROM public.organizations WHERE id = _organization AND owner_id = auth.uid())
    OR EXISTS (SELECT 1 FROM public.organization_members WHERE organization_id = _organization AND user_id = auth.uid())
    OR public.organization_ancestor_manager(_organization)
  )
$$;

-- Cohort read boundary (RESTRICTIVE policy's non-manage branch): additive
-- only — adds ancestor-manager alongside the existing manage/member/report-
-- manager checks, so an ancestor manager can read the cohort row itself.
CREATE OR REPLACE FUNCTION public.cohort_scope_access(_cohort uuid, _manage boolean)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT auth.uid() IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.organization_cohorts oc WHERE oc.cohort_id = _cohort AND
      NOT CASE WHEN _manage THEN public.organization_manage(oc.organization_id) ELSE
        public.organization_access(oc.organization_id) AND (
          public.organization_manage(oc.organization_id)
          OR EXISTS (SELECT 1 FROM public.cohort_members WHERE cohort_id = _cohort AND user_id = auth.uid())
          OR EXISTS (SELECT 1 FROM public.cohort_report_managers WHERE cohort_id = _cohort AND user_id = auth.uid())
          OR public.organization_ancestor_manager(oc.organization_id)
        )
      END
  )
$$;

-- Cohort report access: additive OR branch for an ancestor-org manager.
CREATE OR REPLACE FUNCTION public.cohort_report_access(_cohort uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT auth.uid() IS NOT NULL AND (
    EXISTS (SELECT 1 FROM public.cohorts WHERE id = _cohort AND owner_id = auth.uid() AND public.has_role(auth.uid(), 'admin'))
    OR EXISTS (SELECT 1 FROM public.cohort_report_managers WHERE cohort_id = _cohort AND user_id = auth.uid())
    OR EXISTS (SELECT 1 FROM public.organization_cohorts oc WHERE oc.cohort_id = _cohort AND public.organization_manage(oc.organization_id))
    OR EXISTS (SELECT 1 FROM public.organization_cohorts oc WHERE oc.cohort_id = _cohort AND public.organization_ancestor_manager(oc.organization_id))
  )
  AND public.cohort_scope_access(_cohort, false)
$$;

-- Platform-admin-only: linking two orgs is a trusted configuration action,
-- not self-service, so an org's own manager cannot grant a stranger org
-- read access into it by setting parent_id themselves.
CREATE OR REPLACE FUNCTION public.admin_set_organization_parent(_organization uuid, _parent uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Only a platform administrator can link organizations.';
  END IF;
  UPDATE public.organizations SET parent_id = _parent WHERE id = _organization;
END;
$$;
REVOKE ALL ON FUNCTION public.admin_set_organization_parent(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_set_organization_parent(uuid, uuid) TO authenticated;

-- Platform-admin-only directory, since the organizations table's own RLS
-- scopes reads to members/owners — an admin who manages nothing still needs
-- to see every org to link them into a hierarchy.
CREATE OR REPLACE FUNCTION public.admin_list_organizations()
RETURNS TABLE(id uuid, name text, parent_id uuid)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT o.id, o.name, o.parent_id FROM public.organizations o
  WHERE public.has_role(auth.uid(), 'admin')
  ORDER BY o.name;
$$;
REVOKE ALL ON FUNCTION public.admin_list_organizations() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_list_organizations() TO authenticated;

COMMIT;
