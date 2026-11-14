BEGIN;

-- The original method list ("illustrated","video","steps","scenario","quiz","visual") was enforced
-- by a CHECK constraint on studio_learning_designs. "activities" is a new method, so any such
-- constraint rejects it. Find it by content (name may differ) and replace it with one that includes
-- the new method, rather than guessing the constraint's name.
DO $$
DECLARE
  con record;
BEGIN
  FOR con IN
    SELECT con.conname
    FROM pg_constraint con
    JOIN pg_class rel ON rel.oid = con.conrelid
    WHERE rel.relname = 'studio_learning_designs' AND con.contype = 'c'
      AND pg_get_constraintdef(con.oid) ILIKE '%illustrated%'
  LOOP
    EXECUTE format('ALTER TABLE public.studio_learning_designs DROP CONSTRAINT %I', con.conname);
  END LOOP;
END $$;

ALTER TABLE public.studio_learning_designs
  ADD CONSTRAINT studio_learning_designs_methods_allowed CHECK (
    proposed_methods <@ ARRAY['illustrated','video','steps','scenario','quiz','visual','activities']::text[]
    AND approved_methods <@ ARRAY['illustrated','video','steps','scenario','quiz','visual','activities']::text[]
  );

COMMIT;
