import { cohortReport, cohortReportCsv } from "./cohort-report";

export function cohortSnapshotCsv(input: unknown) {
  const report = cohortReport.parse(input);
  if (report.total !== report.records.length) throw new Error("Incomplete saved report");
  const unique = new Set(report.records.map((row) => `${row.user_id}:${row.course_id}`));
  if (unique.size !== report.total) throw new Error("Duplicate saved report rows");
  return cohortReportCsv(report);
}
