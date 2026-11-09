import { createFileRoute } from "@tanstack/react-router";
import { mimeFor } from "@/lib/scorm";

/** Serves extracted SCORM files from our own address so the package can reach the player's SCORM API. */
export const Route = createFileRoute("/api/scorm-file/$")({
  server: { handlers: { GET: async ({ params }) => {
    const path = params._splat ?? "";
    if (!/^[0-9a-f-]{36}\/[0-9a-f-]{36}\/.+/.test(path) || path.includes("..")) return new Response("Not found", { status: 404 });
    const base = process.env["SUPABASE_URL"];
    const url = `${base}/storage/v1/object/public/scorm-packages/${path.split("/").map(encodeURIComponent).join("/")}`;
    const res = await fetch(url);
    if (!res.ok) return new Response("Not found", { status: 404 });
    return new Response(res.body, { headers: { "Content-Type": mimeFor(path), "Cache-Control": "public, max-age=3600" } });
  } } },
});
