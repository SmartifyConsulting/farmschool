-- LTI 1.3 tool provider (launch-only V1): lets an external platform (Moodle,
-- Canvas, Keycloak-fronted systems, etc.) embed a Plusticity course as an
-- "External tool" activity and launch a signed-in learner straight into it.
--
-- Scope: OIDC third-party-initiated login + resource-link launch, with real
-- JWT signature verification against the platform's own JWKS and nonce replay
-- protection. A launch only ever signs in an EXISTING Plusticity account
-- matched by the platform's verified email claim — it never creates an
-- account from an external claim. Deep linking and Assignment & Grade
-- Services (grade passback) are explicitly out of scope for this migration.

CREATE TABLE public.lti_platforms (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL CHECK (char_length(btrim(name)) BETWEEN 2 AND 120),
  issuer text NOT NULL,
  client_id text NOT NULL,
  deployment_id text NOT NULL,
  auth_login_url text NOT NULL CHECK (auth_login_url ~ '^https://'),
  auth_token_url text NOT NULL CHECK (auth_token_url ~ '^https://'),
  key_set_url text NOT NULL CHECK (key_set_url ~ '^https://'),
  default_course_id uuid REFERENCES public.studio_courses(id) ON DELETE SET NULL,
  enabled boolean NOT NULL DEFAULT true,
  created_by uuid NOT NULL DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (issuer, client_id)
);

-- Short-lived state/nonce pairs issued during login initiation and consumed
-- (deleted) on launch; a launch with an unknown or already-used state fails.
CREATE TABLE public.lti_launch_states (
  state text PRIMARY KEY,
  nonce text NOT NULL,
  platform_id uuid NOT NULL REFERENCES public.lti_platforms(id) ON DELETE CASCADE,
  target_link_uri text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX lti_launch_states_created_idx ON public.lti_launch_states(created_at);

ALTER TABLE public.lti_platforms ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lti_launch_states ENABLE ROW LEVEL SECURITY;

-- Only service_role (server routes using supabaseAdmin) ever touches these
-- tables directly; admins manage platforms through SECURITY DEFINER RPCs so
-- the client never needs a broad grant on lti_platforms.
GRANT ALL ON public.lti_platforms TO service_role;
GRANT ALL ON public.lti_launch_states TO service_role;

CREATE OR REPLACE FUNCTION public.lti_list_platforms() RETURNS SETOF public.lti_platforms
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT * FROM public.lti_platforms
  WHERE public.has_role(auth.uid(), 'admin')
  ORDER BY created_at DESC;
$$;
GRANT EXECUTE ON FUNCTION public.lti_list_platforms() TO authenticated;

CREATE OR REPLACE FUNCTION public.lti_save_platform(
  _id uuid, _name text, _issuer text, _client_id text, _deployment_id text,
  _auth_login_url text, _auth_token_url text, _key_set_url text,
  _default_course_id uuid, _enabled boolean
) RETURNS public.lti_platforms
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _row public.lti_platforms;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Only administrators can manage LTI platforms.';
  END IF;
  IF _id IS NULL THEN
    INSERT INTO public.lti_platforms (
      name, issuer, client_id, deployment_id, auth_login_url, auth_token_url,
      key_set_url, default_course_id, enabled, created_by
    ) VALUES (
      _name, _issuer, _client_id, _deployment_id, _auth_login_url, _auth_token_url,
      _key_set_url, _default_course_id, _enabled, auth.uid()
    ) RETURNING * INTO _row;
  ELSE
    UPDATE public.lti_platforms SET
      name = _name, issuer = _issuer, client_id = _client_id, deployment_id = _deployment_id,
      auth_login_url = _auth_login_url, auth_token_url = _auth_token_url, key_set_url = _key_set_url,
      default_course_id = _default_course_id, enabled = _enabled
    WHERE id = _id RETURNING * INTO _row;
  END IF;
  RETURN _row;
END;
$$;
GRANT EXECUTE ON FUNCTION public.lti_save_platform(
  uuid, text, text, text, text, text, text, text, uuid, boolean
) TO authenticated;

CREATE OR REPLACE FUNCTION public.lti_delete_platform(_id uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Only administrators can manage LTI platforms.';
  END IF;
  DELETE FROM public.lti_platforms WHERE id = _id;
END;
$$;
GRANT EXECUTE ON FUNCTION public.lti_delete_platform(uuid) TO authenticated;

-- Server-only lookup used by the launch handler to find an EXISTING, verified
-- Plusticity account by the platform's email claim. Never creates a user.
CREATE OR REPLACE FUNCTION public.lti_user_id_by_email(_email text) RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, auth AS $$
  SELECT id FROM auth.users
  WHERE lower(email) = lower(_email) AND email_confirmed_at IS NOT NULL
  LIMIT 1;
$$;
REVOKE ALL ON FUNCTION public.lti_user_id_by_email(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.lti_user_id_by_email(text) TO service_role;
