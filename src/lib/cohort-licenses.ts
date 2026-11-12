import { z } from "zod";

export const licenseOrder = z.object({
  id: z.string().uuid(),
  request_id: z.string().uuid(),
  buyer_id: z.string().uuid(),
  cohort_id: z.string().uuid(),
  course_id: z.string().uuid(),
  course_title: z.string(),
  quantity: z.number().int().min(1).max(1000),
  unit_price_cents: z.number().int().positive(),
  currency: z.string().regex(/^[a-z]{3}$/),
  status: z.enum(["pending", "active", "refunded", "disputed"]),
  checkout_url: z.string().nullable(),
  created_at: z.string(),
});
export const licenseReport = z
  .object({
    order: licenseOrder,
    used: z.number().int().nonnegative(),
    remaining: z.number().int().nonnegative(),
    seats: z
      .array(
        z.object({
          id: z.string().uuid(),
          user_id: z.string().uuid(),
          full_name: z.string(),
          enabled: z.boolean(),
          version: z.number().int().positive(),
          note: z.string(),
          allocated_at: z.string(),
          current_member: z.boolean(),
        }),
      )
      .max(1000),
  })
  .refine(
    (report) =>
      report.used === report.seats.length &&
      report.used + report.remaining === report.order.quantity,
    "Licence counts do not match",
  );
export type LicenseReport = z.infer<typeof licenseReport>;
export function licenseReportCsv(report: LicenseReport) {
  const cell = (value: string | number) =>
    '"' +
    (/^[\s]*[=+\-@]|^[\t\r\n]/.test(String(value)) ? "'" : "") +
    String(value).replaceAll('"', '""') +
    '"';
  const rows: (string | number)[][] = [
    [
      "Order ID",
      "Course",
      "Purchase status",
      "Purchased licences",
      "Consumed named licences",
      "Unallocated licences",
      "Unit price (minor units)",
      "Currency",
      "Learner ID",
      "Learner",
      "Licence enabled",
      "Current cohort member",
      "Allocated at",
      "Note",
    ],
  ];
  const common = [
    report.order.id,
    report.order.course_title,
    report.order.status,
    report.order.quantity,
    report.used,
    report.remaining,
    report.order.unit_price_cents,
    report.order.currency,
  ];
  if (!report.seats.length) rows.push([...common, "", "", "", "", "", ""]);
  for (const seat of report.seats)
    rows.push([
      ...common,
      seat.user_id,
      seat.full_name,
      seat.enabled ? "Yes" : "No",
      seat.current_member ? "Yes" : "No",
      seat.allocated_at,
      seat.note,
    ]);
  return rows.map((row) => row.map(cell).join(",")).join("\r\n");
}
