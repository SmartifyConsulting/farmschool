import { describe, expect, it } from "vitest";
import { licenseReport, licenseReportCsv, type LicenseReport } from "./cohort-licenses";
const report: LicenseReport = {
  order: {
    id: "10000000-0000-4000-8000-000000000001",
    request_id: "10000000-0000-4000-8000-000000000002",
    buyer_id: "10000000-0000-4000-8000-000000000003",
    cohort_id: "10000000-0000-4000-8000-000000000004",
    course_id: "10000000-0000-4000-8000-000000000005",
    course_title: 'Training, "advanced"',
    quantity: 1,
    unit_price_cents: 2000,
    currency: "usd",
    status: "active",
    checkout_url: null,
    created_at: "2026-11-12T12:00:00Z",
  },
  used: 1,
  remaining: 0,
  seats: [
    {
      id: "10000000-0000-4000-8000-000000000006",
      user_id: "10000000-0000-4000-8000-000000000007",
      full_name: '=HYPERLINK("unsafe")',
      enabled: false,
      version: 2,
      note: "Group access suspended while the learner record is reviewed.",
      allocated_at: "2026-11-12T12:30:00Z",
      current_member: false,
    },
  ],
};
describe("named licence reporting", () => {
  it("keeps suspended/former members as consumed named seats", () => {
    expect(licenseReport.parse(report)).toMatchObject({ used: 1, remaining: 0 });
  });
  it("rejects misleading inventory totals", () => {
    expect(licenseReport.safeParse({ ...report, remaining: 1 }).success).toBe(false);
    expect(licenseReport.safeParse({ ...report, used: 0 }).success).toBe(false);
  });
  it("quotes CSV text and neutralises formulas", () => {
    const csv = licenseReportCsv(report);
    expect(csv).toContain('"\'=HYPERLINK(""unsafe"")"');
    expect(csv).toContain('"Training, ""advanced"""');
    expect(csv).toContain('"2000","usd"');
  });
});
