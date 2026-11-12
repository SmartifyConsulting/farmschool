BEGIN;
ALTER POLICY course_organization_boundary ON public.studio_courses USING(author_id=auth.uid() OR public.course_catalog_visible(id));
COMMIT;
