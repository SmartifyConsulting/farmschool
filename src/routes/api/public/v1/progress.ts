import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/v1/progress")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const { verifyApiKey, json } = await import("@/lib/api-auth.server");
        const auth = await verifyApiKey(request);
        if (auth instanceof Response) return auth;
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data, error } = await supabaseAdmin.from("lesson_progress")
          .select("course_id, lesson_id, completed, position_seconds, updated_at").eq("user_id", auth.userId);
        if (error) return json({ error: "Could not load progress" }, 500);
        return json({ progress: data });
      },
    },
  },
});
