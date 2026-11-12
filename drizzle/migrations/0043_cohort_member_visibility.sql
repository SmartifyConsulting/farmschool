BEGIN;

CREATE OR REPLACE FUNCTION public.cohort_visible(_cohort uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT EXISTS(SELECT 1 FROM public.cohorts c WHERE c.id=_cohort AND c.owner_id=auth.uid())
    OR EXISTS(SELECT 1 FROM public.cohort_members m WHERE m.cohort_id=_cohort AND m.user_id=auth.uid())
$$;
REVOKE ALL ON FUNCTION public.cohort_visible(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cohort_visible(uuid) TO authenticated, service_role;
DROP POLICY IF EXISTS "Members read their cohorts" ON public.cohorts;
CREATE POLICY "Members read their cohorts" ON public.cohorts FOR SELECT TO authenticated
USING(public.cohort_visible(id));

COMMIT;
