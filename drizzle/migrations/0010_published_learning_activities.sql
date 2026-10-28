-- Learners may read only trainer-approved activities belonging to published courses.
-- Draft and unapproved records remain protected by RLS.
BEGIN;
DROP POLICY IF EXISTS studio_activities_published_read ON public.studio_learning_activities;
CREATE POLICY studio_activities_published_read ON public.studio_learning_activities FOR SELECT TO anon, authenticated
USING (approved = true AND EXISTS (SELECT 1 FROM public.studio_courses c WHERE c.id = course_id AND c.published = true));
GRANT SELECT ON public.studio_learning_activities TO anon;
COMMIT;
