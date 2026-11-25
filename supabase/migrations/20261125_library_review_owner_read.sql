-- Library stages read the current owner's existing review status.
-- Inserts and publication continue through the existing guarded RPCs.
BEGIN;
CREATE POLICY studio_review_approvals_owner_read
ON public.studio_review_approvals
FOR SELECT TO authenticated
USING (
  reviewer_id = auth.uid()
  AND EXISTS (
    SELECT 1 FROM public.studio_courses c
    WHERE c.id = studio_review_approvals.course_id
      AND c.author_id = auth.uid()
  )
);
GRANT SELECT ON public.studio_review_approvals TO authenticated;
COMMIT;
