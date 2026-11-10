BEGIN;

-- Lets an admin adjust a key's daily limit or revoke it outright, without granting admins
-- direct UPDATE on api_keys (the secret-adjacent columns stay out of reach either way).
CREATE OR REPLACE FUNCTION public.admin_update_api_key(_id uuid, _daily_limit integer)
RETURNS public.api_keys LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE result public.api_keys;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN RAISE EXCEPTION 'Administrator access required.'; END IF;
  IF _daily_limit < 1 OR _daily_limit > 100000 THEN RAISE EXCEPTION 'Daily limit must be between 1 and 100000.'; END IF;
  UPDATE public.api_keys SET daily_limit = _daily_limit WHERE id = _id AND revoked_at IS NULL
  RETURNING * INTO result;
  IF result IS NULL THEN RAISE EXCEPTION 'Key not found or already revoked.'; END IF;
  RETURN result;
END;
$$;
REVOKE ALL ON FUNCTION public.admin_update_api_key(uuid, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_update_api_key(uuid, integer) TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_revoke_api_key(_id uuid)
RETURNS public.api_keys LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE result public.api_keys;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN RAISE EXCEPTION 'Administrator access required.'; END IF;
  UPDATE public.api_keys SET revoked_at = now() WHERE id = _id AND revoked_at IS NULL
  RETURNING * INTO result;
  IF result IS NULL THEN RAISE EXCEPTION 'Key not found or already revoked.'; END IF;
  RETURN result;
END;
$$;
REVOKE ALL ON FUNCTION public.admin_revoke_api_key(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_revoke_api_key(uuid) TO authenticated;

COMMIT;
