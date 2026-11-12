import { describe, expect, it } from "vitest";
import { assignmentRuleCriteria, assignmentRuleChangesCsv } from "./cohort-rules";
const id = "10000000-0000-4000-8000-000000000001";
describe("assignment rule controls", () => {
  it("requires bounded schedules and explicit scoped criteria", () => {
    const rule = {
      department: null,
      descendants: true,
      job: " Field ",
      role: "learner",
      addOnly: true,
      interval: 60,
    };
    expect(assignmentRuleCriteria.parse(rule).job).toBe("Field");
    expect(assignmentRuleCriteria.safeParse({ ...rule, interval: 1 }).success).toBe(false);
    expect(assignmentRuleCriteria.safeParse({ ...rule, role: "admin" }).success).toBe(false);
  });
  it("exports recorded identities and refuses inconsistent audit counts", () => {
    const report = {
      request_id: id,
      created_at: "2026-11-12T00:00:00Z",
      result: { status: "applied", version: 2, scheduled: true, added: 1, removed: 0 },
      changes: { added: [id], removed: [] },
    };
    expect(assignmentRuleChangesCsv(report)).toContain('"2","Scheduled","added"');
    expect(() =>
      assignmentRuleChangesCsv({ ...report, result: { ...report.result, added: 3 } }),
    ).toThrow();
  });
});
