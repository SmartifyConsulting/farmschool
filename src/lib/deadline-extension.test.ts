import { describe, expect, it } from "vitest";
import { extendedDeadline } from "./deadline-extension";

describe("individual extensions", () => {
  it("extends a dated assignment", () =>
    expect(extendedDeadline("2026-11-01T10:00:00Z", "2026-11-20T10:00:00Z")).toBe(
      "2026-11-20T10:00:00Z",
    ));
  it("does not shorten a later cohort deadline", () =>
    expect(extendedDeadline("2026-11-25T10:00:00Z", "2026-11-20T10:00:00Z")).toBe(
      "2026-11-25T10:00:00Z",
    ));
  it("does not invent a deadline when an assignment has none", () =>
    expect(extendedDeadline(null, "2026-11-20T10:00:00Z")).toBeNull());
  it("uses the cohort deadline after removal", () =>
    expect(extendedDeadline("2026-11-01T10:00:00Z", null)).toBe("2026-11-01T10:00:00Z"));
});
