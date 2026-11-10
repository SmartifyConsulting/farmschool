import { describe, expect, it } from "vitest";
import { formatPrice, isPaidCourse } from "./marketplace";

describe("isPaidCourse / formatPrice", () => {
  it("treats zero as free and anything above as paid", () => {
    expect(isPaidCourse(0)).toBe(false);
    expect(isPaidCourse(1)).toBe(true);
    expect(formatPrice(0, "usd")).toBe("Free");
    expect(formatPrice(1999, "usd")).toBe("$19.99");
  });
});
