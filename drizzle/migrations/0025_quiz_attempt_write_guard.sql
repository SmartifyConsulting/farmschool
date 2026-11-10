-- Defense in depth: learners may read their own quiz attempts but may
-- never create or modify grades directly. Only trusted server grading writes.
BEGIN;

REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.quiz_attempts FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.quiz_attempts TO authenticated;

DROP POLICY IF EXISTS "own attempts" ON public.quiz_attempts;
DROP POLICY IF EXISTS "Learners read own quiz attempts" ON public.quiz_attempts;
CREATE POLICY "Learners read own quiz attempts"
  ON public.quiz_attempts
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

-- Abort deployment if the client role can still mutate attempts through
-- a future or previously-applied privilege grant.
DO $$
BEGIN
  IF has_table_privilege('authenticated', 'public.quiz_attempts', 'INSERT')
     OR has_table_privilege('authenticated', 'public.quiz_attempts', 'UPDATE')
     OR has_table_privilege('authenticated', 'public.quiz_attempts', 'DELETE') THEN
    RAISE EXCEPTION 'authenticated must not have write privileges on quiz_attempts';
  END IF;
END;
$$;

COMMIT;
