import { z } from "zod";
import { parseQuizQuestions, loadQuizDraft, buildQuiz } from "@/lib/studio-quiz";
import { parsePassMark } from "@/lib/studio";
import { quizSampleSize } from "@/lib/quiz-pools";

export const courseArchiveSchema = z.object({
  format: z.literal("plusticity-course"),
  version: z.literal(1),
  exported_at: z.string(),
  snapshot: z.object({
    organization_id: z.string().uuid().nullable().optional(),
    course: z
      .object({
        id: z.string().uuid(),
        title: z.string().min(1).max(200),
        description: z.string().max(20000),
      })
      .passthrough(),
    modules: z
      .array(
        z
          .object({ id: z.string().uuid(), title: z.string().max(200), position: z.number().int() })
          .passthrough(),
      )
      .max(100),
    lessons: z
      .array(
        z
          .object({
            id: z.string().uuid(),
            module_id: z.string().uuid().nullable(),
            title: z.string().min(1).max(200),
            kind: z.enum(["reading", "video", "slide", "quiz", "scorm"]),
            body: z.string().max(200000),
            position: z.number().int(),
            video_url: z.string().nullable(),
            quiz: z.unknown(),
            secure_bank: z.boolean().optional(),
            exam_policy: z.object({ max_attempts: z.number().int().min(1).max(1000).nullable(), duration_minutes: z.number().int().min(1).max(1440), retry_minutes: z.number().int().min(0).max(10080) }).optional(),
          })
          .passthrough(),
      )
      .min(1)
      .max(500),
    answers: z
      .array(z.object({ lesson_id: z.string().uuid(), answers: z.unknown() }).passthrough())
      .max(500),
    videos: z.array(z.unknown()).max(1000).default([]),
    activities: z
      .array(
        z
          .object({
            activity_key: z.string(),
            lesson_title: z.string(),
            kind: z.enum(["steps", "scenario"]),
            prompt: z.string(),
            evidence: z.string(),
            source_refs: z.unknown(),
          })
          .passthrough(),
      )
      .max(1000)
      .default([]),
  }),
});
export type CourseArchive = z.infer<typeof courseArchiveSchema>;
export function validateCourseArchive(input: unknown): CourseArchive {
  if (JSON.stringify(input).length > 5000000)
    throw new Error("Choose a course archive smaller than 5 MB.");
  const archive = courseArchiveSchema.parse(input);
  const { lessons, modules, answers } = archive.snapshot;
  if (
    new Set(lessons.map((l) => l.id)).size !== lessons.length ||
    new Set(modules.map((m) => m.id)).size !== modules.length ||
    new Set(answers.map((a) => a.lesson_id)).size !== answers.length
  )
    throw new Error("Archive contains duplicate content identifiers.");
  for (const lesson of lessons) {
    if (lesson.module_id && !modules.some((m) => m.id === lesson.module_id))
      throw new Error("Archive contains a lesson with a missing module.");
    if (lesson.kind !== "quiz") {
      if (lesson.exam_policy) throw new Error("Exam controls require a quiz lesson.");
      continue;
    }
    const questions = parseQuizQuestions(lesson.quiz);
    const keys = answers.find((a) => a.lesson_id === lesson.id)?.answers;
    if (!questions?.length || !Array.isArray(keys) || questions.length !== keys.length)
      throw new Error("Archive is missing quiz questions or private answer keys.");
    buildQuiz(loadQuizDraft(questions, keys));
    lesson.quiz = questions;
    const sample = quizSampleSize(lesson.body);
    if (lesson.exam_policy && sample === null) throw new Error("Archived exam controls require a question sample size.");
    if (lesson.secure_bank && sample === null)
      throw new Error("Private exam archives require a saved question sample size.");
    lesson.body = `pass:${parsePassMark(lesson.body)}${sample === null ? "" : `\nsample:${sample}`}`;
  }
  return archive;
}
export function archiveRestoreNotes(archive: CourseArchive) {
  const notes = [
    "Creates a new unpublished course owned by you. Learners, purchases, certificates, grading schemes, competencies, approvals and version history are not imported.",
    "Review and reconfigure prices, prerequisites, certificate policies and linked media before publishing. Uploaded media files are not embedded in this content archive.",
  ];
  if (archive.snapshot.organization_id)
    notes.push(
      "This is a private organization course. Restore requires membership in that organization and preserves its private scope.",
    );
  if (archive.snapshot.videos.length)
    notes.push(
      "Supplementary library links are retained in the archive for reference and must be reconnected manually.",
    );
  if (archive.snapshot.lessons.some((l) => l.kind === "scorm"))
    notes.push(
      "This archive contains a SCORM activity. Restore its original ZIP separately; automatic native-content restoration is unavailable for this archive.",
    );
  return notes;
}
