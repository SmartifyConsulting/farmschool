import { describe, expect, it } from "vitest";
import { programStages, programRosterCsv } from "./programs";
const first = "10000000-0000-4000-8000-000000000001";
const second = "10000000-0000-4000-8000-000000000002";
describe("program requirements", () => {
  it("supports elective thresholds without requiring every course", () => {
    expect(
      programStages.parse([
        { title: "Choose a speciality", required: 1, course_ids: [first, second] },
      ])[0]!.required,
    ).toBe(1);
  });
  it("rejects duplicate courses across stages and impossible completion counts", () => {
    expect(
      programStages.safeParse([
        { title: "First", required: 1, course_ids: [first] },
        { title: "Second", required: 1, course_ids: [first] },
      ]).success,
    ).toBe(false);
    expect(
      programStages.safeParse([{ title: "First", required: 2, course_ids: [first] }]).success,
    ).toBe(false);
  });
  it("exports current program compliance with spreadsheet-safe names", () => {
    const csv = programRosterCsv([
      {
        user_id: first,
        full_name: '=HYPERLINK("bad")',
        complete: false,
        completed_stages: 1,
        total_stages: 2,
      },
    ]);
    expect(csv).toContain('"\'=HYPERLINK(""bad"")"');
    expect(csv).toContain('"No","1","2"');
  });
});
