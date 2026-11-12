import { expect, it } from "vitest";
import { cohortSnapshotCsv } from "./cohort-snapshot";
const row = {
  user_id: "10000000-0000-4000-8000-000000000001",
  course_id: "10000000-0000-4000-8000-000000000002",
  learner_name: '=HYPERLINK("bad")',
  course_title: "Training",
  due_at: null,
  total_lessons: 2,
  completed_lessons: 1,
  certified: false,
  payment_access: true,
};
it("exports recorded progress with spreadsheet-safe learner names", () => {
  const csv = cohortSnapshotCsv({ name: "Training", total: 1, records: [row] });
  expect(csv).toContain("'=HYPERLINK");
  expect(csv).toContain('"1","2","No","Yes"');
});
it("refuses truncated or duplicated report snapshots", () => {
  expect(() => cohortSnapshotCsv({ name: "Training", total: 2, records: [row] })).toThrow(
    "Incomplete",
  );
  expect(() => cohortSnapshotCsv({ name: "Training", total: 2, records: [row, row] })).toThrow(
    "Duplicate",
  );
});
