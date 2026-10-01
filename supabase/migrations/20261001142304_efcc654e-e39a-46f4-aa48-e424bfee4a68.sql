ALTER TABLE public.api_keys
  ADD COLUMN scopes text[] NOT NULL DEFAULT ARRAY['courses:read','progress:read'],
  ADD COLUMN daily_limit integer NOT NULL DEFAULT 1000 CHECK (daily_limit BETWEEN 1 AND 10000),
  ADD COLUMN usage_count integer NOT NULL DEFAULT 0,
  ADD COLUMN usage_date date NOT NULL DEFAULT current_date,
  ADD COLUMN total_requests bigint NOT NULL DEFAULT 0,
  ADD COLUMN revoked_at timestamptz,
  ADD COLUMN rotated_at timestamptz;
ALTER TABLE public.api_keys ADD CONSTRAINT api_keys_scopes_valid CHECK (scopes <@ ARRAY['courses:read','progress:read']::text[] AND cardinality(scopes) > 0);
GRANT UPDATE (name, prefix, key_hash, scopes, daily_limit, revoked_at, rotated_at) ON public.api_keys TO authenticated;