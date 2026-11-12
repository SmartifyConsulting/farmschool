import { describe, expect, it } from "vitest";
import { formatPrice, hasActiveEnrollment, isPaidCourse } from "./marketplace";

describe("isPaidCourse / formatPrice", () => {
  it("denies revoked enrolments and preserves valid legacy enrolments", () => {
    expect(hasActiveEnrollment(null)).toBe(false);
    for (const payment_status of ["refunded", "disputed", "unknown"]) expect(hasActiveEnrollment({ payment_status })).toBe(false);
    for (const payment_status of [null, "paid", "free"]) expect(hasActiveEnrollment({ payment_status })).toBe(true);
  });
  it("treats zero as free and anything above as paid", () => {
    expect(isPaidCourse(0)).toBe(false);
    expect(isPaidCourse(1)).toBe(true);
    expect(formatPrice(0, "usd")).toBe("Free");
    expect(formatPrice(1999, "usd")).toBe("$19.99");
  });
});
