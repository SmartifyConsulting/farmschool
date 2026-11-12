import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { buildXapiStatements, summariseCompliance } from "@/lib/xapi";
import { readAllPages } from "@/lib/database-pages";

async function loadXapiInput() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const results = await Promise.all([
    readAllPages(supabaseAdmin.from("studio_courses").select("id, title", { count: "exact" }).order("id")),
    readAllPages(supabaseAdmin.from("studio_lessons").select("id, course_id, title", { count: "exact" }).order("id")),
    readAllPages(supabaseAdmin.from("lesson_progress").select("user_id, course_id, lesson_id, completed, updated_at", { count: "exact" }).order("user_id").order("course_id").order("lesson_id")),
    readAllPages(supabaseAdmin.from("quiz_attempts").select("user_id, course_id, lesson_id, score, passed, created_at", { count: "exact" }).order("id")),
    readAllPages(supabaseAdmin.from("scorm_packages").select("id, title", { count: "exact" }).order("id")),
    readAllPages(supabaseAdmin.from("scorm_attempts").select("user_id, package_id, lesson_status, score_raw, score_max, updated_at", { count: "exact" }).order("user_id").order("package_id")),
    readAllPages(supabaseAdmin.from("certificates").select("user_id, source, course_ref, title, issued_at, revoked_at", { count: "exact" }).order("id")),
    readAllPages(supabaseAdmin.from("course_enrollments").select("user_id, course_id", { count: "exact" }).order("id")),
    readAllPages(supabaseAdmin.from("cohort_members").select("cohort_id, user_id", { count: "exact" }).order("cohort_id").order("user_id")),
    readAllPages(supabaseAdmin.from("cohort_course_assignments").select("cohort_id, course_id", { count: "exact" }).order("cohort_id").order("course_id")),
  ]);
  const [
    { data: courses },
    { data: lessons },
    { data: progress },
    { data: attempts },
    { data: scormPackages },
    { data: scormAttempts },
    { data: certificates },
    { data: enrollments },
    { data: cohortMembers },
    { data: cohortAssignments },
  ] = results;
  return {
    courses: courses ?? [],
    lessons: lessons ?? [],
    progress: progress ?? [],
    attempts: attempts ?? [],
    scormPackages: scormPackages ?? [],
    scormAttempts: scormAttempts ?? [],
    certificates: certificates ?? [],
    enrollments: enrollments ?? [],
    cohortMembers: cohortMembers ?? [],
    cohortAssignments: cohortAssignments ?? [],
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
