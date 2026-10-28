import { describe, expect, it } from "vitest";
import { friendlyError } from "./friendly-error";

describe("friendlyError", () => {
  it("hides database errors behind the fallback", () => {
    expect(friendlyError({ message: 'update or delete on table "studio_courses" violates foreign key constraint' }, "Could not delete.")).toBe("Could not delete.");
  });
  it("maps permission errors to plain wording", () => {
    expect(friendlyError(new Error("new row violates row-level security policy"))).toBe("You don't have permission to do that.");
  });
  it("maps network failures", () => {
    expect(friendlyError(new TypeError("Failed to fetch"))).toBe("We couldn't reach the server. Check your internet connection and try again.");
  });
  it("keeps short human messages", () => {
    expect(friendlyError(new Error("Finish every lesson first"))).toBe("Finish every lesson first.");
  });
  it("uses fallback for empty errors", () => {
    expect(friendlyError(null, "Try again.")).toBe("Try again.");
  });
});
