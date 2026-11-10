/** Pure, client-safe helpers only — no node:crypto here, since this is imported by browser routes. */

export function isPaidCourse(priceCents: number): boolean {
  return priceCents > 0;
}

export function formatPrice(priceCents: number, currency: string): string {
  if (!isPaidCourse(priceCents)) return "Free";
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: currency.toUpperCase(),
    }).format(priceCents / 100);
  } catch {
    return (priceCents / 100).toFixed(2) + " " + currency.toUpperCase();
  }
}
