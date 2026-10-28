-- Trainer-owned editable activities, separate from learner-visible published objects.
BEGIN;
CREATE TABLE IF NOT EXISTS public.studio_learning_activities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id uuid NOT NULL REFERENCES public.studio_courses(id) ON DELETE CASCADE,
  activity_key text NOT NULL,
  lesson_title text NOT NULL,
  kind text NOT NULL CHECK (kind IN ('steps','scenario')),
  prompt text NOT NULL CHECK (char_length(prompt) BETWEEN 1 AND 12000),
  evidence text NOT NULL DEFAULT '',
  source_refs jsonb NOT NULL DEFAULT '[]'::jsonb,
  approved boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(course_id, activity_key),
  CONSTRAINT studio_learning_activities_size CHECK (octet_length(source_refs::text) <= 20000)
);
ALTER TABLE public.studio_learning_activities ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.studio_learning_activities FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.studio_learning_activities TO authenticated;
DROP POLICY IF EXISTS studio_activities_owner_select ON public.studio_learning_activities;
CREATE POLICY studio_activities_owner_select ON public.studio_learning_activities FOR SELECT TO authenticated
USING (EXISTS (SELECT 1 FROM public.studio_courses c WHERE c.id = course_id AND c.author_id = (SELECT auth.uid())));
DROP POLICY IF EXISTS studio_activities_owner_insert ON public.studio_learning_activities;
CREATE POLICY studio_activities_owner_insert ON public.studio_learning_activities FOR INSERT TO authenticated
WITH CHECK (EXISTS (SELECT 1 FROM public.studio_courses c WHERE c.id = course_id AND c.author_id = (SELECT auth.uid()) AND c.published = false));
DROP POLICY IF EXISTS studio_activities_owner_update ON public.studio_learning_activities;
CREATE POLICY studio_activities_owner_update ON public.studio_learning_activities FOR UPDATE TO authenticated
USING (EXISTS (SELECT 1 FROM public.studio_courses c WHERE c.id = course_id AND c.author_id = (SELECT auth.uid()) AND c.published = false))
WITH CHECK (EXISTS (SELECT 1 FROM public.studio_courses c WHERE c.id = course_id AND c.author_id = (SELECT auth.uid()) AND c.published = false));
DROP POLICY IF EXISTS studio_activities_owner_delete ON public.studio_learning_activities;
CREATE POLICY studio_activities_owner_delete ON public.studio_learning_activities FOR DELETE TO authenticated
USING (EXISTS (SELECT 1 FROM public.studio_courses c WHERE c.id = course_id AND c.author_id = (SELECT auth.uid()) AND c.published = false));
COMMIT;
