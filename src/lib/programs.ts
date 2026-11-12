import { z } from "zod";

export const programStage = z
  .object({
    title: z.string().trim().min(1).max(200),
    required: z.number().int().min(1).max(100),
    course_ids: z.array(z.string().uuid()).min(1).max(100),
  })
  .refine(
    (s) => s.required <= s.course_ids.length,
    "Choose enough courses for the required completions",
  );
export const programStages = z
  .array(programStage)
  .min(1)
  .max(30)
  .superRefine((stages, context) => {
    const ids = stages.flatMap((stage) => stage.course_ids);
    if (ids.length > 200 || new Set(ids).size !== ids.length)
      context.addIssue({
        code: "custom",
        message: "Use each course once, with at most 200 courses",
      });
  });
export type ProgramStage = z.infer<typeof programStage>;
export const programProgress = z.object({
  id: z.string().uuid(),
  title: z.string(),
  description: z.string(),
  version: z.number().int(),
  complete: z.boolean(),
  stages: z.array(
    z.object({
      title: z.string(),
      required: z.number().int(),
      completed: z.number().int(),
      unlocked: z.boolean(),
      courses: z.array(
        z.object({
          id: z.string().uuid(),
          title: z.string(),
          published: z.boolean(),
          complete: z.boolean(),
          certificate_id: z.string().uuid().nullable(),
          expires_at: z.string().nullable(),
        }),
      ),
    }),
  ),
  awards: z.array(
    z.object({ id: z.string().uuid(), issued_at: z.string(), expires_at: z.string().nullable() }),
  ),
});
export function programRosterCsv(
  rows: {
    user_id: string;
    full_name: string;
    complete: boolean;
    completed_stages: number;
    total_stages: number;
  }[],
) {
  const cell = (v: string | number) =>
    '"' +
    (/^[\s]*[=+\-@]|^[\t\r\n]/.test(String(v)) ? "'" : "") +
    String(v).replaceAll('"', '""') +
    '"';
  return [
    ["Learner ID", "Learner", "Current requirements met", "Completed stages", "Total stages"],
    ...rows.map((row) => [
      row.user_id,
      row.full_name,
      row.complete ? "Yes" : "No",
      row.completed_stages,
      row.total_stages,
    ]),
  ]
    .map((row) => row.map(cell).join(","))
    .join("\r\n");
}
