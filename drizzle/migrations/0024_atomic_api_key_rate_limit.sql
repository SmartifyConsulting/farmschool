-- Atomically reserve one API request. This function is service-role only.
-- The UPDATE serializes concurrent requests against the same key row.
BEGIN;

CREATE OR REPLACE FUNCTION public.reserve_api_key_request(
  _key_id uuid,
  _scope text
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  _reserved uuid;
BEGIN
  UPDATE public.api_keys
  SET
    usage_count = CASE
      WHEN usage_date = (now() AT TIME ZONE 'UTC')::date
        THEN usage_count + 1
      ELSE 1
    END,
    usage_date = (now() AT TIME ZONE 'UTC')::date,
    total_requests = total_requests + 1,
    last_used_at = now()
  WHERE id = _key_id
    AND revoked_at IS NULL
    AND _scope = ANY(scopes)
    AND (
      usage_date IS DISTINCT FROM (now() AT TIME ZONE 'UTC')::date
      OR usage_count < daily_limit
    )
  RETURNING id INTO _reserved;

  RETURN _reserved IS NOT NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.reserve_api_key_request(uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.reserve_api_key_request(uuid, text) FROM anon;
REVOKE ALL ON FUNCTION public.reserve_api_key_request(uuid, text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.reserve_api_key_request(uuid, text) TO service_role;

COMMIT;
