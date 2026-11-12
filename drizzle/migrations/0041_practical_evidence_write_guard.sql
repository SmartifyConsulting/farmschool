BEGIN;

REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.lesson_photo_submissions, public.certificates FROM PUBLIC, anon, authenticated;
DROP POLICY IF EXISTS "Learners insert own submissions" ON public.lesson_photo_submissions;

DO $$
BEGIN
  IF has_table_privilege('authenticated', 'public.lesson_photo_submissions', 'INSERT')
     OR has_table_privilege('authenticated', 'public.lesson_photo_submissions', 'UPDATE')
     OR has_table_privilege('authenticated', 'public.lesson_photo_submissions', 'DELETE')
     OR has_table_privilege('authenticated', 'public.lesson_photo_submissions', 'TRUNCATE')
     OR has_table_privilege('authenticated', 'public.certificates', 'INSERT')
     OR has_table_privilege('authenticated', 'public.certificates', 'UPDATE')
     OR has_table_privilege('authenticated', 'public.certificates', 'DELETE')
     OR has_table_privilege('authenticated', 'public.certificates', 'TRUNCATE') THEN
    RAISE EXCEPTION 'Learners must not directly write approvals or certificates';
  END IF;
END;
$$;

COMMIT;
