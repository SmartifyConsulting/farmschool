import { createFileRoute } from "@tanstack/react-router";
import { mimeFor } from "@/lib/scorm";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { verifyScormSession, scormSessionCookieName } from "@/lib/scorm-session.server";

function readCookie(request: Request, name: string): string | null {
  const header = request.headers.get("cookie");
  if (!header) return null;
  for (const part of header.split(";")) {
    const [key, ...rest] = part.trim().split("=");
    if (key === name) return rest.join("=");
  }
  return null;
}

/** Serves extracted SCORM files from our own address after checking course entitlement.
 * The player's <iframe src> can't carry a custom Authorization header, so entitlement is normally
 * proven by the short-lived signed cookie /api/scorm-session hands out; a Bearer header is still
 * accepted for direct/API callers that can set one. */
export const Route = createFileRoute("/api/scorm-file/$")({
  server: { handlers: { GET: async ({ params, request }) => {
    const path = params._splat ?? "";
    if (!/^[0-9a-f-]{36}\/[0-9a-f-]{36}\/.+/.test(path) || path.includes("..")) {
      return new Response("Not found", { status: 404 });
    }
    const [authorId, packageId] = path.split("/");
    if (!authorId || !packageId) return new Response("Not found", { status: 404 });

    const sessionSecret = process.env["SCORM_SESSION_SECRET"];
    const cookieToken = sessionSecret ? readCookie(request, scormSessionCookieName(packageId)) : null;
    const hasValidCookie = cookieToken && sessionSecret && await verifyScormSession(sessionSecret, cookieToken, authorId, packageId);

    if (!hasValidCookie) {
      const authHeader = request.headers.get("authorization");
      if (!authHeader?.startsWith("Bearer ")) return new Response("Unauthorized", { status: 401 });
      const token = authHeader.slice(7);
      const url = process.env["SUPABASE_URL"];
      const key = process.env["SUPABASE_PUBLISHABLE_KEY"];
      if (!url || !key) return new Response("Not configured", { status: 503 });
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
    }

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: file, error: storageError } = await supabaseAdmin.storage
      .from("scorm-packages")
      .download(path);
    if (storageError || !file) return new Response("Not found", { status: 404 });

    return new Response(await file.arrayBuffer(), {
      headers: {
        "Content-Type": mimeFor(path),
        "Cache-Control": "private, max-age=3600",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } } },
});
