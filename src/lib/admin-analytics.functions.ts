import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { summarisePlatform } from "@/lib/studio-analytics";

/** Platform-wide performance for administrators: every course rolled up, plus SCORM completion. */
export const getPlatformAnalytics = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: isAdmin } = await context.supabase.rpc("has_role", {
      _user_id: context.userId,
      _role: "admin",
    });
    if (!isAdmin) throw new Error("Only administrators can view platform analytics.");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const [
      { data: courses },
      { data: progress },
      { data: attempts },
      { data: certs },
      { data: scormAttempts },
    ] = await Promise.all([
      supabaseAdmin.from("studio_courses").select("id, title, published"),
      supabaseAdmin.from("lesson_progress").select("course_id, user_id, completed"),
      supabaseAdmin.from("quiz_attempts").select("course_id, user_id, score, passed"),
      supabaseAdmin.from("certificates").select("user_id").eq("source", "studio"),
      supabaseAdmin.from("scorm_attempts").select("lesson_status, score_raw, score_max"),
    ]);
    return summarisePlatform({
      courses: courses ?? [],
      progress: progress ?? [],
      attempts: attempts ?? [],
      certificates: certs ?? [],
      scormAttempts: scormAttempts ?? [],
    });
  });
