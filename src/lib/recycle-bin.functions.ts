import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { SupabaseClient } from "@supabase/supabase-js";

async function assertAdmin(supabase: SupabaseClient, userId: string) {
  const { data } = await supabase.rpc("has_role" as never, { _user_id: userId, _role: "admin" } as never);
  if (!data) throw new Error("This area is restricted to administrators.");
}

type DeletedCourseRow = { id: string; title: string; category: string; author_id: string; deleted_at: string };

/** Every soft-deleted course across every trainer, for the admin recycle bin. */
export const listDeletedCourses = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { data, error } = await context.supabase
      .from("studio_courses")
      .select("id, title, category, author_id, deleted_at" as never)
      .not("deleted_at" as never, "is", null)
      .order("deleted_at" as never, { ascending: false })
      .limit(500);
    if (error) throw new Error(error.message);
    const rows = (data ?? []) as unknown as DeletedCourseRow[];
    const authorIds = [...new Set(rows.map((c) => c.author_id))];
    const { data: profiles } = authorIds.length
      ? await context.supabase
          .from("profiles" as never)
          .select("user_id, first_name, last_name, full_name" as never)
          .in("user_id" as never, authorIds)
      : { data: [] as unknown[] };
    const nameById = new Map(
      ((profiles ?? []) as unknown as { user_id: string; first_name: string; last_name: string; full_name: string }[]).map((p) => [
        p.user_id,
        [p.first_name, p.last_name].filter(Boolean).join(" ").trim() || p.full_name || "Unknown trainer",
      ]),
    );
    return rows.map((c) => ({ ...c, author_name: nameById.get(c.author_id) ?? "Unknown trainer" }));
  });

/** Brings a soft-deleted course back — only an admin can do this, not the original trainer. */
export const restoreDeletedCourse = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ courseId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { error } = await context.supabase
      .from("studio_courses")
      .update({ deleted_at: null } as never)
      .eq("id", data.courseId);
    if (error) throw new Error(error.message);
    return { ok: true } as const;
  });

/** Permanently removes a course and its lessons — irreversible, admin-only, only from the recycle bin. */
export const permanentlyDeleteCourse = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ courseId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: course } = await context.supabase
      .from("studio_courses")
      .select("id, deleted_at" as never)
      .eq("id", data.courseId)
      .maybeSingle();
    if (!(course as unknown as { deleted_at: string | null } | null)?.deleted_at) {
      throw new Error("Only a course already in the recycle bin can be permanently deleted.");
    }
    await supabaseAdmin.from("studio_lessons").delete().eq("course_id", data.courseId);
    await supabaseAdmin.from("studio_modules" as never).delete().eq("course_id" as never, data.courseId as never);
    const { error } = await supabaseAdmin.from("studio_courses").delete().eq("id", data.courseId);
    if (error) throw new Error(error.message);
    return { ok: true } as const;
  });
