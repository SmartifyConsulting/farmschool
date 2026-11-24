-- Soft delete for draft courses: "Delete course" now moves a course to a recoverable trash
-- (deleted_at set) instead of removing it outright. Permanent deletion still goes through the
-- existing studio_delete_draft RPC, called explicitly from the Deleted courses view.
alter table public.studio_courses
  add column if not exists deleted_at timestamptz;
