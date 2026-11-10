import { createFileRoute } from "@tanstack/react-router";
import { mimeFor } from "@/lib/scorm";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/** Serves extracted SCORM files from our own address after checking course entitlement. */
export const Route = createFileRoute("/api/scorm-file/$")({
  server: { middleware: [requireSupabaseAuth], handlers: { GET: async ({ params, context }) => {
    const path = params._splat ?? "";
    if (!/^[0-9a-f-]{36}\\/[0-9a-f-]{36}\\/.+/.test(path) || path.includes("..")) {
      return new Response("Not found", { status: 404 });
    }

    const [authorId, packageId] = path.split("/");
    if (!authorId || !packageId) return new Response("Not found", { status: 404 });

    // RLS on scorm_packages delegates to scorm_package_visible(), which checks
    // author ownership or entitlement to a course that references this package.
    const { data: pkg, error } = await context.supabase
      .from("scorm_packages")
      .select("id, author_id")
      .eq("id", packageId)
      .eq("author_id", authorId)
      .maybeSingle();
    if (error || !pkg) return new Response("Not found", { status: 404 });

    const base = process.env["SUPABASE_URL"];
    if (!base) return new Response("SCORM storage is unavailable", { status: 503 });
    const url = `${base}/storage/v1/object/public/scorm-packages/${path.split("/").map(encodeURIComponent).join("/")}`;
    const res = await fetch(url);
    if (!res.ok) return new Response("Not found", { status: 404 });
    return new Response(res.body, {
      headers: {
        "Content-Type": mimeFor(path),
        "Cache-Control": "private, max-age=3600",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } } },
});
