-- Enterprise cohorts and course assignment primitives.
BEGIN;

CREATE TABLE IF NOT EXISTS public.cohorts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text NOT NULL DEFAULT '',
  owner_id uuid NOT NULL DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.cohort_members (
  cohort_id uuid NOT NULL REFERENCES public.cohorts(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  added_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(cohort_id,user_id)
);
CREATE TABLE IF NOT EXISTS public.cohort_course_assignments (
  cohort_id uuid NOT NULL REFERENCES public.cohorts(id) ON DELETE CASCADE,
  course_id uuid NOT NULL REFERENCES public.studio_courses(id) ON DELETE CASCADE,
  due_at timestamptz,
  assigned_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(cohort_id,course_id)
);
CREATE INDEX IF NOT EXISTS cohort_members_user_idx ON public.cohort_members(user_id,cohort_id);
CREATE INDEX IF NOT EXISTS cohort_assignments_course_idx ON public.cohort_course_assignments(course_id,cohort_id);

ALTER TABLE public.cohorts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cohort_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cohort_course_assignments ENABLE ROW LEVEL SECURITY;
GRANT SELECT,INSERT,UPDATE,DELETE ON public.cohorts, public.cohort_members, public.cohort_course_assignments TO authenticated;
GRANT ALL ON public.cohorts, public.cohort_members, public.cohort_course_assignments TO service_role;

CREATE POLICY "Owners manage cohorts" ON public.cohorts FOR ALL TO authenticated USING(owner_id=auth.uid()) WITH CHECK(owner_id=auth.uid());
CREATE POLICY "Members and owners read cohort membership" ON public.cohort_members FOR SELECT TO authenticated
USING(user_id=auth.uid() OR EXISTS(SELECT 1 FROM public.cohorts c WHERE c.id=cohort_id AND c.owner_id=auth.uid()));
CREATE POLICY "Owners manage cohort membership" ON public.cohort_members FOR INSERT TO authenticated
WITH CHECK(EXISTS(SELECT 1 FROM public.cohorts c WHERE c.id=cohort_id AND c.owner_id=auth.uid()));
CREATE POLICY "Owners delete cohort membership" ON public.cohort_members FOR DELETE TO authenticated
USING(EXISTS(SELECT 1 FROM public.cohorts c WHERE c.id=cohort_id AND c.owner_id=auth.uid()));
CREATE POLICY "Members and owners read cohort assignments" ON public.cohort_course_assignments FOR SELECT TO authenticated
USING(EXISTS(SELECT 1 FROM public.cohorts c LEFT JOIN public.cohort_members m ON m.cohort_id=c.id AND m.user_id=auth.uid() WHERE c.id=cohort_id AND (c.owner_id=auth.uid() OR m.user_id IS NOT NULL)));
CREATE POLICY "Owners manage cohort assignments" ON public.cohort_course_assignments FOR ALL TO authenticated
USING(EXISTS(SELECT 1 FROM public.cohorts c WHERE c.id=cohort_id AND c.owner_id=auth.uid()))
WITH CHECK(EXISTS(SELECT 1 FROM public.cohorts c WHERE c.id=cohort_id AND c.owner_id=auth.uid()));

COMMIT;
