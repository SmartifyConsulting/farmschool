import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/health")({
  server: {
    handlers: {
      GET: async () => {
        const started = Date.now();
        try {
          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
          const { error } = await supabaseAdmin.from("studio_courses").select("id").limit(1);
          if (error) throw error;
          return Response.json({
            status: "ok",
            database: "ok",
            latency_ms: Date.now() - started,
            timestamp: new Date().toISOString(),
          }, { headers: { "Cache-Control": "no-store" } });
        } catch {
          return Response.json({
            status: "degraded",
            database: "unavailable",
            latency_ms: Date.now() - started,
            timestamp: new Date().toISOString(),
          }, { status: 503, headers: { "Cache-Control": "no-store" } });
        }
      },
    },
  },
});
