import { createRemoteJWKSet, jwtVerify } from "jose";

/**
 * LTI 1.3 tool provider — launch-only V1.
 *
 * Scope: OIDC third-party-initiated login (src/routes/api/lti/login.ts) and
 * resource-link launch (src/routes/api/lti/launch.ts), with real JWT
 * signature verification against the platform's own JWKS and single-use
 * nonce/state replay protection (lti_launch_states, 10-minute TTL).
 *
 * A launch only ever signs in an EXISTING Plusticity account matched by the
 * platform's verified `email` claim (via lti_user_id_by_email) — it never
 * creates an account from an external claim, and it refuses the launch if no
 * matching account exists.
 *
 * Explicitly out of scope for this version: deep linking (an instructor
 * picking which course to link) and Assignment & Grade Services / grade
 * passback. default_course_id or a `custom_course_id` launch parameter is
 * the only way a launch resolves to a specific course.
 */

const MESSAGE_TYPE_CLAIM = "https://purl.imsglobal.org/spec/lti/claim/message_type";
const DEPLOYMENT_ID_CLAIM = "https://purl.imsglobal.org/spec/lti/claim/deployment_id";
const TARGET_LINK_URI_CLAIM = "https://purl.imsglobal.org/spec/lti/claim/target_link_uri";
const CUSTOM_CLAIM = "https://purl.imsglobal.org/spec/lti/claim/custom";

export type LtiPlatform = {
  id: string;
  name: string;
  issuer: string;
  client_id: string;
  deployment_id: string;
  auth_login_url: string;
  auth_token_url: string;
  key_set_url: string;
  default_course_id: string | null;
  enabled: boolean;
};

function randomToken(bytes = 32): string {
  return [...crypto.getRandomValues(new Uint8Array(bytes))]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export async function findLtiPlatform(issuer: string, clientId: string | null): Promise<LtiPlatform | null> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  let query = supabaseAdmin.from("lti_platforms").select("*").eq("issuer", issuer).eq("enabled", true);
  if (clientId) query = query.eq("client_id", clientId);
  const { data } = await query.limit(1).maybeSingle();
  return (data as LtiPlatform | null) ?? null;
}

export async function createLaunchState(platformId: string, targetLinkUri: string | null) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const state = randomToken();
  const nonce = randomToken();
  const { error } = await supabaseAdmin.from("lti_launch_states").insert({
    state,
    nonce,
    platform_id: platformId,
    target_link_uri: targetLinkUri,
  });
  if (error) throw new Error("Could not start the LTI launch.");
  return { state, nonce };
}

const LAUNCH_STATE_TTL_MS = 10 * 60 * 1000;

export async function consumeLaunchState(state: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await supabaseAdmin
    .from("lti_launch_states")
    .select("state, nonce, platform_id, target_link_uri, created_at")
    .eq("state", state)
    .maybeSingle();
  if (!data) return null;
  // Single-use: delete immediately, regardless of what happens next.
  await supabaseAdmin.from("lti_launch_states").delete().eq("state", state);
  if (Date.now() - new Date(data.created_at).getTime() > LAUNCH_STATE_TTL_MS) return null;
  return data;
}

const jwksCache = new Map<string, ReturnType<typeof createRemoteJWKSet>>();

function jwksFor(url: string) {
  let jwks = jwksCache.get(url);
  if (!jwks) {
    jwks = createRemoteJWKSet(new URL(url));
    jwksCache.set(url, jwks);
  }
  return jwks;
}

export type LtiLaunchClaims = {
  sub: string;
  email?: string;
  name?: string;
  [MESSAGE_TYPE_CLAIM]?: string;
  [DEPLOYMENT_ID_CLAIM]?: string;
  [TARGET_LINK_URI_CLAIM]?: string;
  [CUSTOM_CLAIM]?: Record<string, string>;
};

/** Verifies signature, issuer, audience and expiry, then checks LTI-specific claims. Throws on any failure. */
export async function verifyLtiLaunch(idToken: string, platform: LtiPlatform, expectedNonce: string) {
  const { payload } = await jwtVerify(idToken, jwksFor(platform.key_set_url), {
    issuer: platform.issuer,
    audience: platform.client_id,
  });
  const claims = payload as LtiLaunchClaims & { nonce?: string };
  if (claims.nonce !== expectedNonce) throw new Error("Nonce mismatch — possible replay.");
  if (claims[MESSAGE_TYPE_CLAIM] !== "LtiResourceLinkRequest") {
    throw new Error("Only resource-link launches are supported.");
  }
  if (claims[DEPLOYMENT_ID_CLAIM] !== platform.deployment_id) {
    throw new Error("Deployment ID does not match the registered platform.");
  }
  return claims;
}

export function lessonCourseIdFromClaims(claims: LtiLaunchClaims, platform: LtiPlatform): string | null {
  const custom = claims[CUSTOM_CLAIM];
  const fromCustom = custom?.["course_id"];
  if (fromCustom && /^[0-9a-f-]{36}$/i.test(fromCustom)) return fromCustom;
  return platform.default_course_id;
}
