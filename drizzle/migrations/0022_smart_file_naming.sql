BEGIN;

-- original_file_name preserves the as-uploaded name forever; file_name becomes the editable,
-- AI-suggested-or-user-chosen display name. storage_path (already stable) never changes on rename.
ALTER TABLE public.studio_content_files
  ADD COLUMN original_file_name text,
  ADD COLUMN description text NOT NULL DEFAULT '',
  ADD COLUMN classification text NOT NULL DEFAULT '',
  ADD COLUMN keywords text[] NOT NULL DEFAULT '{}',
  ADD COLUMN file_hash text;

UPDATE public.studio_content_files SET original_file_name = file_name WHERE original_file_name IS NULL;
ALTER TABLE public.studio_content_files ALTER COLUMN original_file_name SET NOT NULL;

-- Speeds up duplicate-upload checks within a trainer's own courses.
CREATE INDEX studio_content_files_hash_idx ON public.studio_content_files (file_hash) WHERE file_hash IS NOT NULL;

COMMIT;
