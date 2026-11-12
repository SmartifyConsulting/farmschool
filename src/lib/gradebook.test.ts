import { describe, expect, it } from "vitest";
import { gradebookCsv, gradebookReport, gradebookSummary, type Gradebook } from "./gradebook";

const report: Gradebook = {
  course: { id: "course", title: "Training" },
  total: 1,
  offset: 0,
  limit: 50,
  lessons: [
    { id: "reading", title: "Notes", kind: "reading" },
    { id: "quiz", title: "Quiz", kind: "quiz" },
  ],
  competencies: [{ id: "skill", code: "SAFE-01", title: "Safe technique" }],
  learners: [
    {
      userId: "learner",
      name: "Learner",
      completedLessons: ["reading", "unknown", "reading"],
      certified: false,
      pendingSubmissions: 1,
      quizScores: { quiz: { score: 0, passed: false, attempts: 2 } },
      competencyScores: {},
    },
  ],
};
describe("course gradebook", () => {
  it("preserves zero grades, excludes unknown lessons and leaves missing grades empty", () => {
    expect(gradebookSummary(report.learners[0]!, report)).toEqual({
      completed: 1,
      progress: 50,
      quizMean: 0,
      competencyMean: null,
    });
    expect(gradebookCsv(report)).toContain('"0","","0",""');
  });
  it("does not interpret missing grades as zero when calculating a mean", () => {
    const learner = {
      ...report.learners[0]!,
      competencyScores: {
        skill: { score: 80, achieved: true, assessedAt: "now", source: "rubric" },
      },
    };
    expect(gradebookSummary(learner, report).competencyMean).toBe(80);
  });
  it("quotes names and neutralises spreadsheet formulas", () => {
    const csv = gradebookCsv({
      ...report,
      learners: [{ ...report.learners[0]!, name: '=HYPERLINK("unsafe")' }],
    });
    expect(csv).toContain('"\'=HYPERLINK(""unsafe"")"');
  });
  it("rejects malformed server reports instead of displaying misleading grades", () => {
    expect(
      gradebookReport.safeParse({
        ...report,
        learners: [{ ...report.learners[0], pendingSubmissions: -1 }],
      }).success,
    ).toBe(false);
  });
});
