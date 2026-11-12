BEGIN;

-- Admins can rename a key, change its scopes and daily limit (secret columns stay untouchable).
CREATE OR REPLACE FUNCTION public.admin_edit_api_key(_id uuid, _name text, _scopes text[], _daily_limit integer)
RETURNS public.api_keys LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE result public.api_keys;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN RAISE EXCEPTION 'Administrator access required.'; END IF;
  IF coalesce(length(trim(_name)),0) = 0 OR length(_name) > 60 THEN RAISE EXCEPTION 'Name must be 1 to 60 characters.'; END IF;
  IF _daily_limit < 1 OR _daily_limit > 100000 THEN RAISE EXCEPTION 'Daily limit must be between 1 and 100000.'; END IF;
  IF _scopes IS NULL OR array_length(_scopes,1) IS NULL OR NOT (_scopes <@ ARRAY['courses:read','progress:read']) THEN
    RAISE EXCEPTION 'Pick at least one valid scope.'; END IF;
  UPDATE public.api_keys SET name = trim(_name), scopes = _scopes, daily_limit = _daily_limit
   WHERE id = _id AND revoked_at IS NULL RETURNING * INTO result;
  IF result IS NULL THEN RAISE EXCEPTION 'Key not found or already revoked.'; END IF;
  RETURN result;
END; $$;
REVOKE ALL ON FUNCTION public.admin_edit_api_key(uuid, text, text[], integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_edit_api_key(uuid, text, text[], integer) TO authenticated;

-- Admins can permanently delete a key, but only once it has been revoked.
CREATE OR REPLACE FUNCTION public.admin_delete_api_key(_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN RAISE EXCEPTION 'Administrator access required.'; END IF;
  DELETE FROM public.api_keys WHERE id = _id AND revoked_at IS NOT NULL;
  IF NOT FOUND THEN RAISE EXCEPTION 'Revoke the key before deleting it.'; END IF;
END; $$;
REVOKE ALL ON FUNCTION public.admin_delete_api_key(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_delete_api_key(uuid) TO authenticated;

-- Admins can see revoked keys too (read-only list for audit and deletion).
CREATE OR REPLACE FUNCTION public.admin_list_api_keys()
RETURNS SETOF public.api_keys LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN RAISE EXCEPTION 'Administrator access required.'; END IF;
  RETURN QUERY SELECT * FROM public.api_keys ORDER BY revoked_at NULLS FIRST, last_used_at DESC NULLS LAST;
END; $$;
REVOKE ALL ON FUNCTION public.admin_list_api_keys() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_list_api_keys() TO authenticated;

COMMIT;
