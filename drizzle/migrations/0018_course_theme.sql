BEGIN;

ALTER TABLE public.studio_courses
  ADD COLUMN theme text NOT NULL DEFAULT 'default'
  CHECK (theme IN ('default', 'forest', 'clay', 'sun', 'berry'));

COMMIT;
