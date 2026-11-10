-- Harden legacy API-key helper: do not expose it to anonymous callers.
BEGIN;
REVOKE EXECUTE ON FUNCTION public.api_key_lessons(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.api_key_lessons(text) TO service_role;
COMMIT;
