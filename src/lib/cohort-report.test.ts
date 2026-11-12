import { describe, expect, it } from "vitest";
import { cohortReport, cohortReportCsv } from "./cohort-report";

describe("manager cohort exports", () => {
  const record = {
    user_id: "10000000-0000-4000-8000-000000000001",
    course_id: "10000000-0000-4000-8000-000000000002",
    learner_name: '=HYPERLINK("unsafe")',
    course_title: 'Training, "advanced"',
    due_at: null,
    completed_lessons: 0,
    total_lessons: 2,
    certified: false,
    payment_access: false,
  };
  it("preserves unstarted learners and payment blocks", () => {
    expect(
      cohortReport.parse({ name: "Team", total: 1, records: [record] }).records[0],
    ).toMatchObject({ completed_lessons: 0, certified: false, payment_access: false });
  });
  it("quotes CSV text and blocks spreadsheet formulas", () => {
    const csv = cohortReportCsv({ name: "Team", total: 1, records: [record] });
    expect(csv).toContain('"\'=HYPERLINK(""unsafe"")"');
    expect(csv).toContain('"Training, ""advanced"""');
  });
});
