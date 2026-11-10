import { createHmac, timingSafeEqual } from "node:crypto";

/** Verifies a Stripe webhook's `Stripe-Signature` header against the raw request body. Server-only (node:crypto) — never import from a route component. */
export function verifyStripeSignature(
  payload: string,
  header: string | null,
  secret: string,
  toleranceSeconds = 300,
): boolean {
  if (!header) return false;
  const parts = Object.fromEntries(
    header.split(",").map((part) => part.split("=") as [string, string]),
  );
  const timestamp = parts["t"];
  const signature = parts["v1"];
  if (!timestamp || !signature || !/^\d+$/.test(timestamp)) return false;
  if (Math.abs(Date.now() / 1000 - Number(timestamp)) > toleranceSeconds) return false;
  const expected = createHmac("sha256", secret)
    .update(timestamp + "." + payload)
    .digest("hex");
  const a = Buffer.from(expected, "hex");
  const b = Buffer.from(signature, "hex");
  return a.length === b.length && timingSafeEqual(a, b);
}
