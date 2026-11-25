BEGIN;
CREATE FUNCTION public.content_library_attach_to_draft(
  _source_id uuid, _course_id uuid, _file_id uuid, _storage_path text,
  _lesson_id uuid DEFAULT NULL, _lesson_body text DEFAULT NULL
) RETURNS uuid LANGUAGE plpgsql SECURITY INVOKER SET search_path = public, pg_temp AS $$
DECLARE owner_ref uuid := auth.uid(); source_row public.content_library_files; course_row public.studio_courses;
BEGIN
  IF owner_ref IS NULL THEN RAISE EXCEPTION 'Sign in to reuse material'; END IF;
  SELECT * INTO course_row FROM public.studio_courses WHERE id = _course_id FOR UPDATE;
  IF NOT FOUND OR course_row.author_id <> owner_ref OR course_row.published THEN
    RAISE EXCEPTION 'Choose your own unpublished draft course';
  END IF;
  SELECT * INTO source_row FROM public.content_library_files WHERE id = _source_id AND author_id = owner_ref;
  IF NOT FOUND THEN RAISE EXCEPTION 'This library file is unavailable'; END IF;
  IF _file_id IS NULL OR _storage_path IS NULL OR
    left(_storage_path,length(owner_ref::text || '/' || _course_id::text || '/')) <> owner_ref::text || '/' || _course_id::text || '/' THEN
    RAISE EXCEPTION 'Copy this file into your draft storage first';
  END IF;
  IF (_lesson_id IS NULL) <> (_lesson_body IS NULL) THEN RAISE EXCEPTION 'Incomplete lesson copy'; END IF;
  IF _lesson_id IS NOT NULL AND (source_row.material_stage <> 'produced' OR source_row.file_type <> 'text'
    OR length(trim(_lesson_body)) NOT BETWEEN 1 AND 100000) THEN RAISE EXCEPTION 'Choose an editable Produced lesson'; END IF;
  IF EXISTS (SELECT 1 FROM public.studio_content_files WHERE id = _file_id) THEN
    IF NOT EXISTS (SELECT 1 FROM public.studio_content_files WHERE id = _file_id AND course_id = _course_id
      AND storage_path = _storage_path AND file_name = source_row.file_name) THEN RAISE EXCEPTION 'Copy identifier already used'; END IF;
    IF _lesson_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.studio_lessons WHERE id = _lesson_id
      AND course_id = _course_id AND body = _lesson_body) THEN RAISE EXCEPTION 'Lesson copy differs from the saved attempt'; END IF;
    RETURN _file_id;
  END IF;
  INSERT INTO public.studio_content_files(id,course_id,module_id,file_name,original_file_name,file_type,
    storage_path,size_bytes,description,classification,keywords,file_hash)
    VALUES(_file_id,_course_id,NULL,source_row.file_name,source_row.original_file_name,source_row.file_type,
      _storage_path,source_row.size_bytes,source_row.description,source_row.classification,source_row.keywords,source_row.file_hash);
  IF _lesson_id IS NOT NULL THEN
    INSERT INTO public.studio_lessons(id,course_id,title,kind,body,position)
      VALUES(_lesson_id,_course_id,left(regexp_replace(source_row.file_name,'\.md$','','i'),200),'slide',_lesson_body,
        (SELECT coalesce(max(position),-1)+1 FROM public.studio_lessons WHERE course_id = _course_id));
  END IF;
  RETURN _file_id;
END;
$$;
REVOKE ALL ON FUNCTION public.content_library_attach_to_draft(uuid,uuid,uuid,text,uuid,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.content_library_attach_to_draft(uuid,uuid,uuid,text,uuid,text) TO authenticated;
COMMIT;
