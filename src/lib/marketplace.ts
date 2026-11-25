/** Pure, client-safe helpers only — no node:crypto here, since this is imported by browser routes. */
import { displayAmount, minorUnitFactor } from "./local-currency";

export function isPaidCourse(priceCents: number): boolean {
  return priceCents > 0;
}

export function hasActiveEnrollment(enrollment: { payment_status: string | null } | null | undefined): boolean {
  return !!enrollment && (enrollment.payment_status === null || enrollment.payment_status === "paid" || enrollment.payment_status === "free");
}

export function formatPrice(priceCents: number, currency: string): string {
  if (!isPaidCourse(priceCents)) return "Free";
  try {
    return displayAmount(priceCents / minorUnitFactor(currency), currency);
  } catch {
    return (priceCents / 100).toFixed(2) + " " + currency.toUpperCase();
  }
}
