-- Approved Raw / Produced library workflow. 25 November 2026.
-- Existing standalone library records remain Raw. No file bytes are changed.
BEGIN;

ALTER TABLE public.content_library_files
  ADD COLUMN material_stage text NOT NULL DEFAULT 'raw'
    CHECK (material_stage IN ('raw', 'produced'));
ALTER TABLE public.content_library_files
  ADD CONSTRAINT content_library_files_id_author_unique UNIQUE (id, author_id);

CREATE TABLE public.content_library_derivations (
  author_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  raw_file_id uuid NOT NULL,
  produced_file_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (raw_file_id, produced_file_id),
  CHECK (raw_file_id <> produced_file_id),
  FOREIGN KEY (raw_file_id, author_id)
    REFERENCES public.content_library_files(id, author_id) ON DELETE NO ACTION DEFERRABLE INITIALLY DEFERRED,
  FOREIGN KEY (produced_file_id, author_id)
    REFERENCES public.content_library_files(id, author_id) ON DELETE CASCADE
);
CREATE INDEX content_library_derivations_produced_idx
  ON public.content_library_derivations(produced_file_id);
CREATE INDEX content_library_files_stage_idx
  ON public.content_library_files(author_id, material_stage, folder_id);

ALTER TABLE public.content_library_derivations ENABLE ROW LEVEL SECURITY;
CREATE POLICY content_library_derivations_owner
  ON public.content_library_derivations FOR ALL TO authenticated
  USING (author_id = auth.uid()) WITH CHECK (author_id = auth.uid());
GRANT SELECT, INSERT, DELETE ON public.content_library_derivations TO authenticated;

CREATE FUNCTION public.content_library_check_derivation()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path = public, pg_temp AS $$
BEGIN
  IF NEW.author_id IS DISTINCT FROM auth.uid() OR NOT EXISTS (
    SELECT 1 FROM public.content_library_files
    WHERE id = NEW.raw_file_id AND author_id = NEW.author_id AND material_stage = 'raw'
  ) OR NOT EXISTS (
    SELECT 1 FROM public.content_library_files
    WHERE id = NEW.produced_file_id AND author_id = NEW.author_id AND material_stage = 'produced'
  ) THEN
    RAISE EXCEPTION 'Choose your own Raw source and Produced output';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER content_library_derivation_guard
  BEFORE INSERT OR UPDATE ON public.content_library_derivations
  FOR EACH ROW EXECUTE FUNCTION public.content_library_check_derivation();

CREATE FUNCTION public.content_library_check_stage_change()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path = public, pg_temp AS $$
BEGIN
  IF OLD.material_stage IS DISTINCT FROM NEW.material_stage AND EXISTS (
    SELECT 1 FROM public.content_library_derivations
    WHERE raw_file_id = OLD.id OR produced_file_id = OLD.id
  ) THEN
    RAISE EXCEPTION 'A linked file must retain its Raw or Produced identity';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER content_library_stage_guard
  BEFORE UPDATE OF material_stage ON public.content_library_files
  FOR EACH ROW EXECUTE FUNCTION public.content_library_check_stage_change();

-- Upload output bytes under the current user's studio-content path first.
-- Register the output and its source links atomically. On RPC failure, the
-- application removes its newly uploaded output object; originals stay intact.
CREATE FUNCTION public.content_library_register_produced(
  _file_id uuid,
  _source_ids uuid[],
  _file_name text,
  _file_type text,
  _storage_path text,
  _size_bytes bigint,
  _description text DEFAULT '',
  _folder_id uuid DEFAULT NULL
) RETURNS uuid LANGUAGE plpgsql SECURITY INVOKER SET search_path = public, pg_temp AS $$
DECLARE
  owner_ref uuid := auth.uid();
  sources uuid[];
  existing_sources uuid[];
BEGIN
  IF owner_ref IS NULL THEN RAISE EXCEPTION 'Sign in to produce material'; END IF;
  IF _file_id IS NULL OR _source_ids IS NULL
     OR cardinality(_source_ids) NOT BETWEEN 1 AND 20
     OR array_position(_source_ids, NULL) IS NOT NULL THEN
    RAISE EXCEPTION 'Choose between one and twenty Raw source files';
  END IF;
  SELECT array_agg(DISTINCT value ORDER BY value) INTO sources
    FROM unnest(_source_ids) AS inputs(value);
  IF _file_id = ANY(sources) OR (
    SELECT count(*) FROM public.content_library_files
    WHERE id = ANY(sources) AND author_id = owner_ref AND material_stage = 'raw'
  ) <> cardinality(sources) THEN
    RAISE EXCEPTION 'A source is unavailable or is not your Raw material';
  END IF;
  IF _file_name IS NULL OR length(trim(_file_name)) NOT BETWEEN 1 AND 255
     OR _file_type IS NULL OR length(trim(_file_type)) NOT BETWEEN 1 AND 40
     OR _storage_path IS NULL OR left(_storage_path, length(owner_ref::text) + 1) <> owner_ref::text || '/'
     OR _size_bytes IS NULL OR _size_bytes <= 0 OR _size_bytes > 524288000
     OR length(coalesce(_description, '')) > 4000 THEN
    RAISE EXCEPTION 'Check the produced file details';
  END IF;
  IF _folder_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.content_library_folders WHERE id = _folder_id AND author_id = owner_ref
  ) THEN RAISE EXCEPTION 'Choose your own library folder'; END IF;

  IF EXISTS (SELECT 1 FROM public.content_library_files WHERE id = _file_id) THEN
    SELECT array_agg(raw_file_id ORDER BY raw_file_id) INTO existing_sources
      FROM public.content_library_derivations WHERE produced_file_id = _file_id AND author_id = owner_ref;
    IF existing_sources IS DISTINCT FROM sources OR NOT EXISTS (
      SELECT 1 FROM public.content_library_files
      WHERE id = _file_id AND author_id = owner_ref AND material_stage = 'produced'
        AND storage_path = _storage_path AND file_name = trim(_file_name)
        AND file_type = trim(_file_type) AND size_bytes = _size_bytes
    ) THEN RAISE EXCEPTION 'This output identifier already has different content'; END IF;
    RETURN _file_id;
  END IF;

  INSERT INTO public.content_library_files (
    id, author_id, file_name, original_file_name, file_type, storage_path,
    size_bytes, description, folder_id, material_stage
  ) VALUES (
    _file_id, owner_ref, trim(_file_name), trim(_file_name), trim(_file_type), _storage_path,
    _size_bytes, coalesce(_description, ''), _folder_id, 'produced'
  );
  INSERT INTO public.content_library_derivations (author_id, raw_file_id, produced_file_id)
    SELECT owner_ref, value, _file_id FROM unnest(sources) AS inputs(value);
  RETURN _file_id;
END;
$$;
REVOKE ALL ON FUNCTION public.content_library_register_produced(uuid,uuid[],text,text,text,bigint,text,uuid)
  FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.content_library_register_produced(uuid,uuid[],text,text,text,bigint,text,uuid)
  TO authenticated;

COMMIT;

-- Required application behavior accompanying this proposal:
-- Raw badge is Processed only when a saved derivation exists; no manually toggled flag.
-- Raw files with linked outputs cannot be deleted. Explain this before any storage delete.
-- Delete an allowed file's database row first, then clean up its stored bytes.
-- Deleting a Produced output removes its links; the Raw badge is recalculated.
-- Folder visibility/search is filtered by stage without moving or duplicating originals.
-- Curriculum reuse makes explicit copies into an owned draft; never mutate a published lesson.
