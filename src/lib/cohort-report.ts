import { z } from "zod";

export const cohortReport = z.object({
  name: z.string(),
  total: z.number().int().nonnegative(),
  records: z.array(
    z.object({
      user_id: z.string().uuid(),
      course_id: z.string().uuid(),
      learner_name: z.string(),
      course_title: z.string(),
      due_at: z.string().nullable(),
      total_lessons: z.number().int().nonnegative(),
      completed_lessons: z.number().int().nonnegative(),
      certified: z.boolean(),
      payment_access: z.boolean(),
    }),
  ),
});
export type CohortReport = z.infer<typeof cohortReport>;
export function cohortReportCsv(report: CohortReport) {
  const cell = (value: string | number) =>
    '"' +
    (/^[\s]*[=+\-@]|^[\t\r\n]/.test(String(value)) ? "'" : "") +
    String(value).replaceAll('"', '""') +
    '"';
  return [
    [
      "Learner ID",
      "Learner",
      "Course ID",
      "Course",
      "Deadline",
      "Completed lessons",
      "Total lessons",
      "Certified",
      "Payment access",
    ],
    ...report.records.map((item) => [
      item.user_id,
      item.learner_name,
      item.course_id,
      item.course_title,
      item.due_at ?? "",
      item.completed_lessons,
      item.total_lessons,
      item.certified ? "Yes" : "No",
      item.payment_access ? "Yes" : "No",
    ]),
  ]
    .map((row) => row.map(cell).join(","))
    .join("\r\n");
}
