import { createFileRoute } from "@tanstack/react-router";
import { createLaunchState, findLtiPlatform } from "@/lib/lti.server";

/** OIDC third-party-initiated login (LTI 1.3 step 1). The platform (Moodle,
 * etc.) redirects or posts here before the actual resource-link launch. */
async function handle(request: Request) {
  let params: URLSearchParams;
  if (request.method === "POST") {
    const form = await request.formData();
    params = new URLSearchParams();
    for (const [k, v] of form.entries()) if (typeof v === "string") params.set(k, v);
  } else {
    params = new URL(request.url).searchParams;
  }

  const iss = params.get("iss");
  const loginHint = params.get("login_hint");
  const targetLinkUri = params.get("target_link_uri");
  const clientId = params.get("client_id");
  const ltiMessageHint = params.get("lti_message_hint");

  if (!iss || !loginHint) return new Response("Missing iss or login_hint.", { status: 400 });

  const platform = await findLtiPlatform(iss, clientId);
  if (!platform) return new Response("Unknown or disabled LTI platform.", { status: 400 });

  const { state, nonce } = await createLaunchState(platform.id, targetLinkUri);

  const site = process.env["SITE_URL"];
  if (!site) return new Response("Server misconfigured: SITE_URL is not set.", { status: 500 });

  const redirect = new URL(platform.auth_login_url);
  redirect.searchParams.set("scope", "openid");
  redirect.searchParams.set("response_type", "id_token");
  redirect.searchParams.set("response_mode", "form_post");
  redirect.searchParams.set("prompt", "none");
  redirect.searchParams.set("client_id", platform.client_id);
  redirect.searchParams.set("redirect_uri", `${site.replace(/\/+$/, "")}/api/lti/launch`);
  redirect.searchParams.set("login_hint", loginHint);
  redirect.searchParams.set("state", state);
  redirect.searchParams.set("nonce", nonce);
  if (ltiMessageHint) redirect.searchParams.set("lti_message_hint", ltiMessageHint);

  return new Response(null, { status: 302, headers: { Location: redirect.toString() } });
}

export const Route = createFileRoute("/api/lti/login")({
  server: { handlers: { GET: ({ request }) => handle(request), POST: ({ request }) => handle(request) } },
});
