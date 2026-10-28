CREATE OR REPLACE FUNCTION public.studio_learning_designs_guard()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
    owner_id uuid;
    is_published boolean;
BEGIN
    SELECT c.author_id, c.published INTO owner_id, is_published
    FROM public.studio_courses AS c
    WHERE c.id = COALESCE(NEW.course_id, OLD.course_id);

    -- Parent course already removed in this statement (cascade from an authorised course delete).
    IF TG_OP = 'DELETE' AND NOT FOUND THEN
        RETURN OLD;
    END IF;

    IF owner_id IS DISTINCT FROM auth.uid() THEN
        RAISE EXCEPTION 'Only the course owner can modify its learning design';
    END IF;
    IF is_published THEN
        RAISE EXCEPTION 'Unpublish the course before changing its learning design';
    END IF;
    IF TG_OP = 'DELETE' THEN
        RETURN OLD;
    END IF;
    IF NEW.review_status = 'approved' THEN
        NEW.approved_by = auth.uid();
        NEW.approved_at = now();
        NEW.approved_methods = NEW.proposed_methods;
        IF cardinality(NEW.approved_methods) = 0 THEN
            RAISE EXCEPTION 'Select at least one method before approval';
        END IF;
    ELSE
        NEW.approved_by = NULL;
        NEW.approved_at = NULL;
        NEW.approved_methods = '{}';
    END IF;
    RETURN NEW;
END;
$$;

DROP POLICY IF EXISTS "authors delete" ON public.studio_courses;
CREATE POLICY "authors delete own drafts" ON public.studio_courses
  FOR DELETE TO authenticated
  USING (auth.uid() = author_id AND published = false);

CREATE OR REPLACE FUNCTION public.studio_delete_draft(_course_id uuid)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE c record;
BEGIN
  IF auth.uid() IS NULL THEN RETURN 'not_signed_in'; END IF;
  SELECT author_id, published INTO c FROM public.studio_courses WHERE id = _course_id FOR UPDATE;
  IF NOT FOUND THEN RETURN 'not_found'; END IF;
  IF c.author_id <> auth.uid() THEN RETURN 'not_owner'; END IF;
  IF c.published THEN RETURN 'published'; END IF;
  DELETE FROM public.studio_courses WHERE id = _course_id;
  RETURN 'deleted';
END;
$$;
REVOKE ALL ON FUNCTION public.studio_delete_draft(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.studio_delete_draft(uuid) TO authenticated;