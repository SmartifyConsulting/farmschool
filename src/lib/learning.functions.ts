import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { courses, allLessons } from "@/lib/courses";
import { parsePassMark } from "@/lib/studio";

/** Grades a studio quiz on the server so answer keys never reach learners. */
export const submitQuiz = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ lessonId: z.string().uuid(), answers: z.array(z.number().int().min(-1).max(20)).max(50) }).parse(i))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: lesson } = await context.supabase.from("studio_lessons").select("id, course_id, kind, body").eq("id", data.lessonId).maybeSingle();
    if (!lesson || lesson.kind !== "quiz") throw new Error("Quiz not found.");
    const { data: key } = await supabaseAdmin.from("studio_quiz_answers").select("answers").eq("lesson_id", lesson.id).maybeSingle();
    const answers = key?.answers ?? [];
    if (!answers.length) throw new Error("This quiz has no questions yet.");
    const correct = answers.filter((a, i) => data.answers[i] === a).length;
    const score = Math.round((correct / answers.length) * 100);
    const passMark = parsePassMark(lesson.body);
    const passed = score >= passMark;
    await supabaseAdmin.from("quiz_attempts").insert({ user_id: context.userId, course_id: lesson.course_id, lesson_id: lesson.id, score, passed });
    if (passed) await context.supabase.from("lesson_progress").upsert({ user_id: context.userId, course_id: lesson.course_id, lesson_id: lesson.id, completed: true, position_seconds: 0, updated_at: new Date().toISOString() }, { onConflict: "user_id,course_id,lesson_id" });
    return { score, passed, passMark, correct: answers.map((a, i) => data.answers[i] === a) };
  });

/** Issues a certificate only when every lesson is complete (and studio quizzes were passed on the server). */
export const claimCertificate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ source: z.enum(["studio", "catalogue"]), courseRef: z.string().min(1).max(80) }).parse(i))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: prog } = await context.supabase.from("lesson_progress").select("lesson_id").eq("course_id", data.courseRef).eq("completed", true);
    const done = new Set((prog ?? []).map((p: { lesson_id: string }) => p.lesson_id));
    let title = "";
    if (data.source === "catalogue") {
      const c = courses.find((x) => x.id === data.courseRef);
      if (!c) throw new Error("Course not found.");
      if (!allLessons(c).every((l) => done.has(l.id))) throw new Error("Finish every lesson first.");
      title = c.title;
    } else {
      const { data: c } = await context.supabase.from("studio_courses").select("id, title").eq("id", data.courseRef).maybeSingle();
      if (!c) throw new Error("Course not found.");
      const { data: lessons } = await supabaseAdmin.from("studio_lessons").select("id, kind").eq("course_id", c.id);
      const { data: passes } = await supabaseAdmin.from("quiz_attempts").select("lesson_id").eq("user_id", context.userId).eq("course_id", c.id).eq("passed", true);
      const passed = new Set((passes ?? []).map((p) => p.lesson_id));
      if (!lessons?.length || !lessons.every((l) => (l.kind === "quiz" ? passed.has(l.id) : done.has(l.id)))) throw new Error("Finish every lesson and pass every quiz first.");
      title = c.title;
    }
    const { error } = await supabaseAdmin.from("certificates").upsert({ user_id: context.userId, source: data.source, course_ref: data.courseRef, title }, { onConflict: "user_id,source,course_ref", ignoreDuplicates: true });
    if (error) throw new Error("Could not issue the certificate.");
    return { ok: true, title };
  });

async function moodleBase() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await supabaseAdmin.from("moodle_settings").select("base_url, enabled").eq("id", 1).maybeSingle();
  if (!data?.enabled || !data.base_url) return null;
  return data.base_url;
}

/** Pulls the signed-in learner's Moodle enrolments, progress and completions (matched by email). */
export const syncMyMoodle = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const base = await moodleBase();
    if (!base) return { ok: false, message: "The Moodle connection is not switched on yet. Your Mobile School courses still work." };
    const email = (context.claims as { email?: string }).email;
    if (!email) return { ok: false, message: "Your account has no email to match in Moodle." };
    const { callMoodle } = await import("./moodle.server");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    try {
      const users = await callMoodle<{ id: number }[]>(base, "core_user_get_users_by_field", { field: "email", "values[0]": email });
      if (!users.length) return { ok: false, message: "No Moodle account uses your email yet." };
      const enrolled = await callMoodle<{ id: number; fullname: string; progress?: number | null; completed?: boolean }[]>(base, "core_enrol_get_users_courses", { userid: String(users[0]!.id) });
      const now = new Date().toISOString();
      const rows = enrolled.map((c) => ({ user_id: context.userId, moodle_id: c.id, progress: Math.round(c.progress ?? 0), completed: !!c.completed, synced_at: now }));
      if (rows.length) await supabaseAdmin.from("moodle_enrolments").upsert(rows, { onConflict: "user_id,moodle_id" });
      const done = enrolled.filter((c) => c.completed).map((c) => ({ user_id: context.userId, source: "moodle", course_ref: String(c.id), title: c.fullname }));
      if (done.length) await supabaseAdmin.from("certificates").upsert(done, { onConflict: "user_id,source,course_ref", ignoreDuplicates: true });
      return { ok: true, message: `Synced ${rows.length} Moodle course${rows.length === 1 ? "" : "s"}.` };
    } catch (e) {
      console.error("moodle sync", e);
      return { ok: false, message: e instanceof Error ? e.message : "Moodle could not be reached." };
    }
  });

/** Pushes a published studio course shell into Moodle (author only). */
export const publishToMoodle = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ courseId: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    const { data: c } = await context.supabase.from("studio_courses").select("id, title, description, author_id, moodle_id").eq("id", data.courseId).maybeSingle();
    if (!c || c.author_id !== context.userId) throw new Error("Only the author can publish this course.");
    if (c.moodle_id) return { ok: true, message: "Already in Moodle." };
    const base = await moodleBase();
    if (!base) return { ok: false, message: "The Moodle connection is not switched on yet — the course is live in Mobile School." };
    const { callMoodle } = await import("./moodle.server");
    try {
      const res = await callMoodle<{ id: number }[]>(base, "core_course_create_courses", {
        "courses[0][fullname]": c.title, "courses[0][shortname]": `MS-${c.id.slice(0, 8)}`, "courses[0][categoryid]": "1", "courses[0][summary]": c.description,
      });
      await context.supabase.from("studio_courses").update({ moodle_id: res[0]!.id }).eq("id", c.id);
      return { ok: true, message: "Course created in Moodle." };
    } catch (e) {
      return { ok: false, message: e instanceof Error ? e.message : "Moodle could not be reached." };
    }
  });
