import { z } from "zod";

const score = z.number().finite().min(0).max(100);
export const gradingCategory = z.object({
  id: z.string().uuid(),
  title: z.string().trim().min(1).max(100),
  weight: z.number().positive().max(100),
  items: z
    .array(z.object({ kind: z.enum(["quiz", "competency"]), id: z.string().uuid() }))
    .min(1)
    .max(100),
});
export type GradingCategory = z.infer<typeof gradingCategory>;
export const gradebookReport = z.object({
  grading: z
    .object({ version: z.number().int().nonnegative(), categories: z.array(gradingCategory) })
    .optional(),
  course: z.object({ id: z.string(), title: z.string() }),
  total: z.number().int().nonnegative(),
  offset: z.number().int().nonnegative(),
  limit: z.number().int().positive(),
  lessons: z.array(z.object({ id: z.string(), title: z.string(), kind: z.string() })),
  competencies: z.array(z.object({ id: z.string(), code: z.string(), title: z.string() })),
  learners: z.array(
    z.object({
      userId: z.string(),
      name: z.string(),
      completedLessons: z.array(z.string()),
      certified: z.boolean(),
      pendingSubmissions: z.number().int().nonnegative(),
      finalGrade: z
        .object({
          calculated: score.nullable(),
          score: score.nullable(),
          decisionId: z.string().uuid().nullable(),
          headId: z.string().uuid().nullable(),
          overridden: z.boolean(),
          categories: z.array(
            z.object({
              id: z.string(),
              title: z.string(),
              score: score.nullable(),
              weight: z.number(),
            }),
          ),
        })
        .optional(),
      quizScores: z.record(
        z.object({ score, passed: z.boolean(), attempts: z.number().int().positive() }),
      ),
      competencyScores: z.record(
        z.object({
          score: score.nullable(),
          achieved: z.boolean(),
          assessedAt: z.string(),
          source: z.string(),
        }),
      ),
    }),
  ),
});
export type Gradebook = z.infer<typeof gradebookReport>;

export function gradebookSummary(learner: Gradebook["learners"][number], report: Gradebook) {
  const completed = new Set(
    learner.completedLessons.filter((id) => report.lessons.some((lesson) => lesson.id === id)),
  ).size;
  const quizScores = report.lessons
    .filter((lesson) => lesson.kind === "quiz")
    .flatMap((lesson) =>
      learner.quizScores[lesson.id] ? [learner.quizScores[lesson.id]!.score] : [],
    );
  const competencyScores = report.competencies.flatMap((competency) =>
    typeof learner.competencyScores[competency.id]?.score === "number"
      ? [learner.competencyScores[competency.id]!.score!]
      : [],
  );
  const mean = (values: number[]) =>
    values.length
      ? Math.round((values.reduce((total, value) => total + value, 0) / values.length) * 100) / 100
      : null;
  return {
    completed,
    progress: report.lessons.length ? Math.round((completed / report.lessons.length) * 100) : 0,
    quizMean: mean(quizScores),
    competencyMean: mean(competencyScores),
  };
}

export function gradebookCsv(report: Gradebook): string {
  const quizzes = report.lessons.filter((lesson) => lesson.kind === "quiz");
  const cell = (value: string | number | null) => {
    let text = value === null ? "" : String(value);
    if (/^[\s]*[=+\-@]/.test(text) || /^[\t\r\n]/.test(text)) text = "'" + text;
    return '"' + text.replaceAll('"', '""') + '"';
  };
  const header = [
    "Learner ID",
    "Learner",
    "Completed lessons",
    "Total lessons",
    "Progress (%)",
    "Certified",
    "Pending submissions",
    "Latest quiz mean (%)",
    "Latest competency mean (%)",
    ...quizzes.map((quiz) => "Quiz: " + quiz.title),
    ...report.competencies.map(
      (competency) => "Competency: " + competency.code + " " + competency.title,
    ),
    "Weighted grade (%)",
    "Final grade (%)",
    "Approved override",
  ];
  const rows = report.learners.map((learner) => {
    const summary = gradebookSummary(learner, report);
    return [
      learner.userId,
      learner.name,
      summary.completed,
      report.lessons.length,
      summary.progress,
      learner.certified ? "Yes" : "No",
      learner.pendingSubmissions,
      summary.quizMean,
      summary.competencyMean,
      ...quizzes.map((quiz) => learner.quizScores[quiz.id]?.score ?? null),
      ...report.competencies.map(
        (competency) => learner.competencyScores[competency.id]?.score ?? null,
      ),
      learner.finalGrade?.calculated ?? null,
      learner.finalGrade?.score ?? null,
      learner.finalGrade?.overridden ? "Yes" : "No",
    ];
  });
  return [header, ...rows].map((row) => row.map(cell).join(",")).join("\r\n");
}
