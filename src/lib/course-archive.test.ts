import { describe, expect, it } from "vitest";
import { validateCourseArchive, archiveRestoreNotes } from "./course-archive";
const course = "10000000-0000-4000-8000-000000000001";
const lesson = "10000000-0000-4000-8000-000000000002";
const fixture = () => ({
  format: "plusticity-course",
  version: 1,
  exported_at: "2026-11-12T00:00:00Z",
  snapshot: {
    course: { id: course, title: "Native course", description: "Private answer-key test" },
    modules: [],
    lessons: [
      {
        id: lesson,
        module_id: null,
        title: "Quiz",
        kind: "quiz",
        body: "pass:75",
        position: 0,
        video_url: null,
        quiz: [{ question: "Choose true", options: ["True", "False"] }],
      },
    ],
    answers: [{ lesson_id: lesson, answers: [0] }],
    videos: [],
    activities: [],
  },
});
describe("native content archives", () => {
  it("normalises legacy questions while preserving their private keys", () => {
    const archive = validateCourseArchive(fixture());
    expect(archive.snapshot.lessons[0]!.quiz).toEqual([
      { kind: "choice", q: "Choose true", options: ["True", "False"] },
    ]);
    expect(archive.snapshot.answers[0]!.answers).toEqual([0]);
  });
  it("rejects missing keys and duplicate content identifiers", () => {
    const missing = fixture();
    missing.snapshot.answers = [];
    expect(() => validateCourseArchive(missing)).toThrow("private answer keys");
    const duplicate = fixture();
    duplicate.snapshot.lessons.push(duplicate.snapshot.lessons[0]!);
    expect(() => validateCourseArchive(duplicate)).toThrow("duplicate");
  });
  it("explains media and administrative settings that require reconnection", () => {
    const archive = validateCourseArchive(fixture());
    archive.snapshot.lessons[0]!.kind = "scorm";
    archive.snapshot.videos.push({ id: "external-link" });
    expect(archiveRestoreNotes(archive).join(" ")).toMatch(/SCORM.*ZIP/);
    expect(archiveRestoreNotes(archive).join(" ")).toContain("must be reconnected manually");
  });
});
