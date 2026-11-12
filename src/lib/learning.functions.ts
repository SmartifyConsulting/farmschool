import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { courses, allLessons } from "@/lib/courses";
import { parsePassMark } from "@/lib/studio";
import { gradeQuiz, parseQuizQuestions, quizSubmission } from "@/lib/studio-quiz";
import { parseLessonSlides, practicalTaskIndex } from "@/lib/lesson-slides";
import { hasActiveEnrollment } from "@/lib/marketplace";
import { chooseQuizIndices, quizSampleSize, privateQuizBankId, quizResult } from "@/lib/quiz-pools";

export const beginQuizAttempt = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => z.object({ lessonId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: lesson, error } = await supabaseAdmin
      .from("studio_lessons")
      .select(
        "id,course_id,body,quiz,studio_quiz_answers!studio_quiz_answers_lesson_id_fkey(answers,course_id)",
      )
      .eq("id", data.lessonId)
      .eq("kind", "quiz")
      .maybeSingle();
    if (error || !lesson || lesson.studio_quiz_answers?.course_id !== lesson.course_id)
      throw new Error("This quiz is not ready.");
    const access = await context.supabase.rpc("studio_course_visible", {
      _course: lesson.course_id,
    });
    if (access.error || access.data !== true)
      throw new Error("This course is not available to you.");
    const bankId = privateQuizBankId(lesson.body);
    let pool = lesson.quiz;
    if (bankId) {
      const bank = await supabaseAdmin.from("studio_exam_banks").select("questions").eq("id", bankId).maybeSingle();
      if (bank.error || !bank.data) throw new Error("This private exam is not ready.");
      pool = bank.data.questions;
    }
    const questions = parseQuizQuestions(pool);
    const size = quizSampleSize(lesson.body);
    if (!questions?.length || size === null || size > questions.length)
      throw new Error("This random quiz is not configured correctly.");
    const { data: started, error: startError } = await supabaseAdmin.rpc("start_quiz_exam", {
      _user: context.userId,
      _lesson: lesson.id,
      _expected_body: lesson.body,
      _expected_quiz: lesson.quiz,
      _expected_answers: lesson.studio_quiz_answers.answers,
      _selection: chooseQuizIndices(questions.length, size),
    });
    if (startError)
      throw new Error(
        "Could not start the quiz. Refresh and try again; new random attempts are limited to 50 per day.",
      );
    const result = z
      .object({ attemptId: z.string().uuid(), questions: z.unknown(), expiresAt: z.string() })
      .parse(started);
    const selected = parseQuizQuestions(result.questions);
    if (!selected || selected.length !== size)
      throw new Error("Could not load the selected questions.");
    return { attemptId: result.attemptId, questions: selected, expiresAt: result.expiresAt };
  });

/** Grades a studio quiz on the server so answer keys never reach learners. */
export const submitQuiz = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(quizSubmission)
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    // Read questions and their private keys in one query so a revision cannot mix versions.
    const { data: lesson } = await supabaseAdmin
      .from("studio_lessons")
      .select(
        "id, course_id, body, quiz, studio_courses!inner(author_id, published), studio_quiz_answers!studio_quiz_answers_lesson_id_fkey(answers, course_id)",
      )
      .eq("id", data.lessonId)
      .eq("kind", "quiz")
      .maybeSingle();
    if (
      !lesson?.studio_courses ||
      (!lesson.studio_courses.published && lesson.studio_courses.author_id !== context.userId)
    ) {
      throw new Error("Quiz not found.");
    }
    const { data: visible, error: accessError } = await context.supabase.rpc(
      "studio_course_visible",
      { _course: lesson.course_id },
    );
    if (accessError || visible !== true) throw new Error("This course is not available to you.");
    let questions = parseQuizQuestions(lesson.quiz);
    const key = lesson.studio_quiz_answers;
    if (!questions || !key || key.course_id !== lesson.course_id)
      throw new Error("This quiz is not ready to be graded.");
    let keys: unknown = key.answers;
    let passMark = parsePassMark(lesson.body);
    let lease: string | null = null;
    if (data.attemptId) {
      const reserved = await supabaseAdmin.rpc("reserve_quiz_exam", {
        _session: data.attemptId,
        _user: context.userId,
        _lesson: lesson.id,
      });
      if (reserved.error)
        throw new Error(
          "This attempt is unavailable, expired or already being graded. Wait or start a new attempt.",
        );
      const saved = z.object({ result: quizResult }).safeParse(reserved.data);
      if (saved.success) return saved.data.result;
      const active = z
        .object({
          lease: z.string().uuid(),
          questions: z.unknown(),
          answers: z.unknown(),
          passMark: z.number().int().min(1).max(100),
        })
        .parse(reserved.data);
      questions = parseQuizQuestions(active.questions);
      keys = active.answers;
      passMark = active.passMark;
      lease = active.lease;
    } else if (quizSampleSize(lesson.body) !== null)
      throw new Error("Start a random quiz attempt before submitting answers.");
    try {
      if (!questions?.length) throw new Error("The saved question selection could not be loaded.");
      const grading = gradeQuiz(questions, keys, data.answers);
      const written = grading.filter((item) => typeof item !== "boolean");
      const feedback: (string | null)[] = questions.map(() => null);
      const correct = grading.map((item) => item === true);
      if (written.length) {
        const apiKey = process.env["OPENAI_API_KEY"];
        if (!apiKey)
          throw new Error(
            "Written grading is unavailable right now. Your answers were not graded.",
          );
        const { data: used, error: quotaError } = await supabaseAdmin.rpc(
          "written_quiz_reserve_request",
          { _user_id: context.userId },
        );
        if (quotaError || typeof used !== "number")
          throw new Error(
            "Written grading is unavailable right now. Your answers were not graded.",
          );
        if (used === 0)
          throw new Error(
            "You’ve reached the daily limit for quizzes with written responses. Try again tomorrow.",
          );
        try {
          const { gradeWrittenQuiz } = await import("@/lib/ai/written-quiz.server");
          const writtenGrades = await gradeWrittenQuiz(apiKey, written);
          for (const [index, grade] of writtenGrades) {
            correct[index] = grade.correct;
            feedback[index] = grade.feedback;
          }
        } catch {
          throw new Error(
            "Written grading did not finish. Your answers were kept on this page so you can try again.",
          );
        }
      }
      const score = Math.round((correct.filter(Boolean).length / questions.length) * 100);
      const passed = score >= passMark;
      if (data.attemptId && lease) {
        const finished = await supabaseAdmin.rpc("finish_quiz_exam", {
          _session: data.attemptId,
          _user: context.userId,
          _lease: lease,
          _correct: correct,
          _feedback: feedback,
        });
        if (finished.error)
          throw new Error("Could not save this attempt. Refresh before retrying.");
        return quizResult.parse(finished.data);
      }
      const { error } = await supabaseAdmin
        .from("quiz_attempts")
        .insert({
          user_id: context.userId,
          course_id: lesson.course_id,
          lesson_id: lesson.id,
          score,
          passed,
        });
      if (error) throw new Error("Could not save the quiz attempt.");
      if (passed) {
        const { error: progressError } = await context.supabase
          .from("lesson_progress")
          .upsert(
            {
              user_id: context.userId,
              course_id: lesson.course_id,
              lesson_id: lesson.id,
              completed: true,
              position_seconds: 0,
              updated_at: new Date().toISOString(),
            },
            { onConflict: "user_id,course_id,lesson_id" },
          );
        if (progressError) throw new Error("Could not update lesson progress. Please retry.");
      }
      return { score, passed, passMark, correct, feedback };
    } catch (error) {
      if (data.attemptId && lease)
        await supabaseAdmin.rpc("release_quiz_exam", { _session: data.attemptId, _lease: lease });
      throw error;
    }
  });

/** Issues a certificate only when every lesson is complete (and studio quizzes were passed on the server). */
export const claimCertificate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ source: z.enum(["studio", "catalogue"]), courseRef: z.string().min(1).max(80) }).parse(i))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: prog, error: progressError } = await context.supabase.from("lesson_progress").select("lesson_id").eq("course_id", data.courseRef).eq("completed", true);
    if (progressError) throw new Error("Could not verify lesson completion. Please try again.");
    const done = new Set((prog ?? []).map((p: { lesson_id: string }) => p.lesson_id));
    let title = "";
    if (data.source === "catalogue") {
      const c = courses.find((x) => x.id === data.courseRef);
      if (!c) throw new Error("Course not found.");
      if (!allLessons(c).every((l) => done.has(l.id))) throw new Error("Finish every lesson first.");
      title = c.title;
    } else {
      const { data: c } = await context.supabase.from("studio_courses").select("id, title, published, price_cents, author_id, version_number").eq("id", data.courseRef).maybeSingle();
      if (!c) throw new Error("Course not found.");
      if (!c.published && c.author_id !== context.userId) throw new Error("Course is not available.");
      const { data: visible, error: accessError } = await context.supabase.rpc("studio_course_visible", { _course: c.id });
      if (accessError || visible !== true) throw new Error("This course is not available to you.");
      if ((c.price_cents ?? 0) > 0 && c.author_id !== context.userId) {
        const { data: enrollment } = await supabaseAdmin
          .from("course_enrollments")
          .select("id, payment_status")
          .eq("user_id", context.userId)
          .eq("course_id", c.id)
          .maybeSingle();
        if (!hasActiveEnrollment(enrollment)) {
          const licensed=await context.supabase.rpc("my_course_paid_access",{_course:c.id});
          if (licensed.error || licensed.data!==true) throw new Error("Enroll in this course before claiming its certificate.");
        }
      }
      const { data: lessons } = await supabaseAdmin.from("studio_lessons").select("id, kind, body, title, video_url, quiz").eq("course_id", c.id);
      const { data: passes } = await supabaseAdmin.from("quiz_attempts").select("lesson_id").eq("user_id", context.userId).eq("course_id", c.id).eq("passed", true);
      const passed = new Set((passes ?? []).map((p) => p.lesson_id));
      const { scormLessonRef } = await import("@/lib/scorm");
      const scormIds = (lessons ?? []).map((l) => l.kind === "scorm" ? scormLessonRef(String((l as { body?: string }).body ?? "")) : null).filter((x): x is string => !!x);
      const { data: scormDone } = scormIds.length ? await supabaseAdmin.from("scorm_attempts").select("package_id").eq("user_id", context.userId).in("package_id", scormIds).in("lesson_status", ["passed", "completed"]) : { data: [] };
      const finishedPkgs = new Set((scormDone ?? []).map((a) => a.package_id));
      if (!lessons?.length || !lessons.every((l) => (l.kind === "quiz" ? passed.has(l.id) : l.kind === "scorm" ? finishedPkgs.has(scormLessonRef(String((l as { body?: string }).body ?? "")) ?? "") : done.has(l.id)))) throw new Error("Finish every lesson and pass every quiz first.");
      const photoTasks = lessons.flatMap((lesson) => {
        if (lesson.kind !== "slide") return [];
        const slides = parseLessonSlides(lesson.body ?? "");
        return slides.flatMap((slide, slideIndex) => slide.blocks.flatMap((block, blockIndex) =>
          block.kind === "photo" ? [{ lessonId: lesson.id, blockIndex: practicalTaskIndex(slides, slideIndex, blockIndex) }] : [],
        ));
      });
      if (photoTasks.length) {
        const { data: evidence, error: evidenceError } = await supabaseAdmin.from("lesson_photo_submissions")
          .select("lesson_id, block_index, reviewed_by")
          .eq("user_id", context.userId)
          .in("lesson_id", [...new Set(photoTasks.map((task) => task.lessonId))])
          .eq("status", "approved");
        if (evidenceError) throw new Error("Could not verify practical evidence. Please try again.");
        if (!photoTasks.every((task) => evidence?.some((row) =>
          row.lesson_id === task.lessonId && row.block_index === task.blockIndex && row.reviewed_by === c.author_id,
        ))) throw new Error("Your trainer must approve every practical photo task before you can claim a certificate.");
      }
      const { data: issued, error: issueError } = await supabaseAdmin.rpc("issue_studio_certificate", {
        _user: context.userId,
        _course: c.id,
        _expected_version: c.version_number,
        _expected_lessons: lessons.map(({ id, kind, body, title, video_url, quiz }) => ({ id, kind, body, title, video_url, quiz })).sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
        _photo_tasks: photoTasks,
      });
      if (issueError) throw new Error("Could not issue the certificate. The course or completion status may have changed. Refresh and try again, or contact your trainer.");
      const result = z.object({ id: z.string().uuid(), title: z.string() }).safeParse(issued);
      if (!result.success) throw new Error("Could not confirm the certificate. Please try again.");
      return { ok: true, title: result.data.title };
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
    if (!base) return { ok: false, message: "The Moodle connection is not switched on yet. Your Plusticity courses still work." };
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
    if (!base) return { ok: false, message: "The Moodle connection is not switched on yet — the course is live in Plusticity." };
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
