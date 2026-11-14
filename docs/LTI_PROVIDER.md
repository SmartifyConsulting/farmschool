# LTI 1.3 tool provider (launch-only)

Plusticity can act as an LTI 1.3 "external tool" that another platform
(Moodle, or anything OIDC-compliant, including a Keycloak-fronted system)
launches into. An administrator registers the platform's issuer, client ID,
deployment ID, and its login/token/JWKS endpoints at `/admin/lti`. The
platform's own tool configuration is pointed at:

- OIDC login initiation: `/api/lti/login`
- Redirect URI / launch: `/api/lti/launch`
- Tool JWKS: `/api/lti/jwks` (currently returns no keys — see below)

## What actually happens on launch

1. The platform redirects the learner's browser to `/api/lti/login` with
   `iss`, `login_hint`, and `target_link_uri`. Plusticity looks up the
   registered platform, issues a single-use `state`/`nonce` pair
   (`lti_launch_states`, 10-minute TTL), and redirects to the platform's own
   login endpoint.
2. The platform redirects back to `/api/lti/launch` with a signed `id_token`.
   Plusticity verifies the signature against the platform's **own** JWKS
   (fetched live from `key_set_url`), checks `iss`/`aud`/`nonce`/expiry, and
   checks the LTI `message_type` and `deployment_id` claims.
3. The verified `email` claim is looked up against **existing** Plusticity
   accounts only (`lti_user_id_by_email`). If no account matches, the launch
   fails with an explicit message — **no account is ever created from an
   external claim.**
4. On a match, Plusticity mints a Supabase magic-sign-in link for that email
   and redirects the browser to it, landing on the resource-linked course
   (`custom_course_id` launch parameter, falling back to the platform's
   configured default course) already signed in.

## Explicitly out of scope

- **Deep linking.** An instructor cannot yet pick which Plusticity course to
  link from inside the platform's course-builder UI; a platform-side
  `custom_course_id` parameter or the platform's default course is the only
  way a launch resolves to a course today.
- **Assignment & Grade Services (grade passback).** `/api/lti/jwks` returns
  no keys because this tool never signs an outbound request — AGS requires
  that, and is not implemented.
- **Names and Role Provisioning Services (roster sync).**

## Not yet verified

This has not been round-tripped against a real platform (Moodle, Keycloak,
or otherwise). The JWT verification logic, claim checks, and magic-link
redirect are implemented against the LTI 1.3 and OIDC specs, but correctness
of a live launch — including how a specific platform shapes its `id_token`
claims — needs to be proven against a real registered platform before any
learner-facing rollout.
