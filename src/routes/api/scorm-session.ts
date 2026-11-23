import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { signScormSession, scormSessionCookieName } from "@/lib/scorm-session.server";

const ID = /^[0-9a-f-]{36}$/;

/** Checks entitlement once (via an explicit fetch, which can carry an Authorization header) and hands
 * back a short-lived signed cookie, since the SCORM player's <iframe src> can never send that header
 * itself for the file requests that follow. */
export const Route = createFileRoute("/api/scorm-session")({
  server: { handlers: { POST: async ({ request }) => {
    const authHeader = request.headers.get("authorization");
    if (!authHeader?.startsWith("Bearer ")) return new Response("Unauthorized", { status: 401 });
    const token = authHeader.slice(7);
    const url = process.env["SUPABASE_URL"];
    const key = process.env["SUPABASE_PUBLISHABLE_KEY"];
    const sessionSecret = process.env["SCORM_SESSION_SECRET"];
    if (!url || !key || !sessionSecret) return new Response("Not configured", { status: 503 });

    let body: unknown;
    try { body = await request.json(); } catch { return new Response("Invalid request", { status: 400 }); }
    const { authorId, packageId } = (body ?? {}) as { authorId?: unknown; packageId?: unknown };
    if (typeof authorId !== "string" || typeof packageId !== "string" || !ID.test(authorId) || !ID.test(packageId)) {
      return new Response("Invalid request", { status: 400 });
    }

    const userClient = createClient<Database>(url, key, {
      global: { headers: { Authorization: `Bearer ${token}` } },
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: claims, error: authError } = await userClient.auth.getClaims(token);
    if (authError || !claims?.claims?.sub) return new Response("Unauthorized", { status: 401 });

    // RLS on scorm_packages delegates to scorm_package_visible(), which checks
    // author ownership or entitlement to a course that references this package.
    const { data: pkg, error } = await userClient
      .from("scorm_packages")
      .select("id, author_id")
      .eq("id", packageId)
      .eq("author_id", authorId)
      .maybeSingle();
    if (error || !pkg) return new Response("Not found", { status: 404 });

    const { token: sessionToken } = await signScormSession(sessionSecret, authorId, packageId);
    const cookie = `${scormSessionCookieName(packageId)}=${sessionToken}; Path=/api/scorm-file; Max-Age=7200; SameSite=Lax; Secure; HttpOnly`;
    return new Response(null, { status: 204, headers: { "Set-Cookie": cookie } });
  } } },
});
