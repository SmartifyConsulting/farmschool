import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { buildXapiStatements, summariseCompliance } from "@/lib/xapi";

async function loadXapiInput() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const [
    { data: courses },
    { data: lessons },
    { data: progress },
    { data: attempts },
    { data: scormPackages },
    { data: scormAttempts },
    { data: certificates },
  ] = await Promise.all([
    supabaseAdmin.from("studio_courses").select("id, title"),
    supabaseAdmin.from("studio_lessons").select("id, course_id, title"),
    supabaseAdmin
      .from("lesson_progress")
      .select("user_id, course_id, lesson_id, completed, updated_at"),
    supabaseAdmin
      .from("quiz_attempts")
      .select("user_id, course_id, lesson_id, score, passed, created_at"),
    supabaseAdmin.from("scorm_packages").select("id, title"),
    supabaseAdmin
      .from("scorm_attempts")
      .select("user_id, package_id, lesson_status, score_raw, score_max, updated_at"),
    supabaseAdmin.from("certificates").select("user_id, source, course_ref, title, issued_at"),
  ]);
  return {
    courses: courses ?? [],
    lessons: lessons ?? [],
    progress: progress ?? [],
    attempts: attempts ?? [],
    scormPackages: scormPackages ?? [],
    scormAttempts: scormAttempts ?? [],
    certificates: certificates ?? [],
  };
}

/** Per-learner, per-course completion status, for finding who still needs to finish or be signed off. */
export const getComplianceReport = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: isAdmin } = await context.supabase.rpc("has_role", {
      _user_id: context.userId,
      _role: "admin",
    });
    if (!isAdmin) throw new Error("Only administrators can view compliance reporting.");
    return summariseCompliance(await loadXapiInput());
  });

/** Exports every tracked fact as xAPI 1.0.3 statements, for any external LRS to ingest. */
export const exportXapiStatements = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: isAdmin } = await context.supabase.rpc("has_role", {
      _user_id: context.userId,
      _role: "admin",
    });
    if (!isAdmin) throw new Error("Only administrators can view compliance reporting.");
    return buildXapiStatements(await loadXapiInput());
  });
