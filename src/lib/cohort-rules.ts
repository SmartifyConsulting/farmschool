import { z } from "zod";
export const assignmentRuleCriteria = z.object({
  department: z.string().uuid().nullable(),
  descendants: z.boolean(),
  job: z.string().trim().max(200).nullable(),
  role: z.enum(["learner", "manager", "all"]),
  addOnly: z.boolean(),
  interval: z.number().int().min(15).max(10080),
});
export const assignmentRulePreview = z.object({
  hash: z.string().regex(/^[a-f0-9]{64}$/),
  add: z.number().int().nonnegative(),
  remove: z.number().int().nonnegative(),
  matching: z.number().int().nonnegative(),
  current: z.number().int().nonnegative(),
  excluded: z.number().int().nonnegative(),
  seat_limit: z.number().int().nullable(),
  capacity_ok: z.boolean(),
  examples: z.array(z.object({ name: z.string(), action: z.enum(["Add", "Remove"]) })).max(20),
});
export const assignmentRuleResult = z.object({
  status: z.enum(["applied", "busy", "not_found", "not_due"]),
  added: z.number().int().nonnegative(),
  removed: z.number().int().nonnegative(),
});
const completed = z.object({
  status: z.literal("applied"),
  added: z.number().int().nonnegative(),
  removed: z.number().int().nonnegative(),
  version: z.number().int().positive(),
  scheduled: z.boolean(),
});
export const assignmentRuleChangeReport = z
  .object({
    request_id: z.string().uuid(),
    created_at: z.string(),
    result: completed,
    changes: z.object({ added: z.array(z.string().uuid()), removed: z.array(z.string().uuid()) }),
  })
  .refine(
    (r) =>
      r.result.added === r.changes.added.length && r.result.removed === r.changes.removed.length,
    "Change report counts do not match",
  );
export function assignmentRuleChangesCsv(input: unknown) {
  const report = assignmentRuleChangeReport.parse(input);
  const cell = (v: string | number) =>
    '"' +
    (/^[\s]*[=+\-@]|^[\t\r\n]/.test(String(v)) ? "'" : "") +
    String(v).replaceAll('"', '""') +
    '"';
  return [
    ["Run ID", "Run time", "Rule version", "Execution", "Action", "Learner ID"],
    ...(["added", "removed"] as const).flatMap((action) =>
      report.changes[action].map((person) => [
        report.request_id,
        report.created_at,
        report.result.version,
        report.result.scheduled ? "Scheduled" : "Manual",
        action,
        person,
      ]),
    ),
  ]
    .map((row) => row.map(cell).join(","))
    .join("\r\n");
}
