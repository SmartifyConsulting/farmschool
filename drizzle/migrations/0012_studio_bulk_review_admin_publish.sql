CREATE OR REPLACE FUNCTION public.creator_enforce_publish_approval()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.published AND (TG_OP = 'INSERT' OR (TG_OP = 'UPDATE' AND NOT OLD.published)) THEN
    IF NOT public.has_role(NEW.author_id, 'admin') AND NOT EXISTS (
      SELECT 1 FROM public.creator_applications WHERE user_id = NEW.author_id AND status = 'approved'
    ) THEN
      RAISE EXCEPTION 'Creator approval is required before publishing';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.creator_enforce_publish_approval() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.studio_mark_imported_reviewed(_course_id uuid)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE c public.studio_courses; reviewed integer;
BEGIN
  SELECT * INTO c FROM public.studio_courses WHERE id = _course_id FOR UPDATE;
  IF auth.uid() IS NULL OR c.author_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'Only the owner may review this course';
  END IF;
  IF c.published THEN RAISE EXCEPTION 'Published courses are read-only'; END IF;
  UPDATE public.studio_lessons
    SET body = rtrim(regexp_replace(body, 'Review required before publishing\.', '', 'gi'))
    WHERE course_id = _course_id AND body ILIKE '%Review required before publishing.%';
  GET DIAGNOSTICS reviewed = ROW_COUNT;
  RETURN reviewed;
END;
$$;
REVOKE ALL ON FUNCTION public.studio_mark_imported_reviewed(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.studio_mark_imported_reviewed(uuid) TO authenticated;