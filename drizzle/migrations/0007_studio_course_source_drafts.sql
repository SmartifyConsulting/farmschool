-- FarmSchool source-manual and draft-outline persistence
-- Run in Supabase SQL Editor before enabling cloud draft sync.
BEGIN;
CREATE TABLE IF NOT EXISTS public.studio_course_source_drafts (
  course_id uuid PRIMARY KEY REFERENCES public.studio_courses(id) ON DELETE CASCADE,
  source_name text NOT NULL DEFAULT 'Training manual',
  source_text text NOT NULL DEFAULT '',
  draft jsonb,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT studio_course_source_drafts_source_limit CHECK (octet_length(source_text) <= 4000000),
  CONSTRAINT studio_course_source_drafts_draft_limit CHECK (draft IS NULL OR octet_length(draft::text) <= 4000000)
);
CREATE OR REPLACE FUNCTION public.studio_course_source_drafts_touch()
RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;
DROP TRIGGER IF EXISTS studio_course_source_drafts_touch_trigger ON public.studio_course_source_drafts;
CREATE TRIGGER studio_course_source_drafts_touch_trigger
BEFORE UPDATE ON public.studio_course_source_drafts FOR EACH ROW
EXECUTE FUNCTION public.studio_course_source_drafts_touch();
ALTER TABLE public.studio_course_source_drafts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.studio_course_source_drafts FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.studio_course_source_drafts TO authenticated;
DROP POLICY IF EXISTS studio_source_owner_read ON public.studio_course_source_drafts;
CREATE POLICY studio_source_owner_read ON public.studio_course_source_drafts FOR SELECT TO authenticated
USING (EXISTS (SELECT 1 FROM public.studio_courses c WHERE c.id = course_id AND c.author_id = (SELECT auth.uid())));
DROP POLICY IF EXISTS studio_source_owner_insert ON public.studio_course_source_drafts;
CREATE POLICY studio_source_owner_insert ON public.studio_course_source_drafts FOR INSERT TO authenticated
WITH CHECK (EXISTS (SELECT 1 FROM public.studio_courses c WHERE c.id = course_id AND c.author_id = (SELECT auth.uid()) AND c.published = false));
DROP POLICY IF EXISTS studio_source_owner_update ON public.studio_course_source_drafts;
CREATE POLICY studio_source_owner_update ON public.studio_course_source_drafts FOR UPDATE TO authenticated
USING (EXISTS (SELECT 1 FROM public.studio_courses c WHERE c.id = course_id AND c.author_id = (SELECT auth.uid()) AND c.published = false))
WITH CHECK (EXISTS (SELECT 1 FROM public.studio_courses c WHERE c.id = course_id AND c.author_id = (SELECT auth.uid()) AND c.published = false));
DROP POLICY IF EXISTS studio_source_owner_delete ON public.studio_course_source_drafts;
CREATE POLICY studio_source_owner_delete ON public.studio_course_source_drafts FOR DELETE TO authenticated
USING (EXISTS (SELECT 1 FROM public.studio_courses c WHERE c.id = course_id AND c.author_id = (SELECT auth.uid()) AND c.published = false));
COMMIT;
