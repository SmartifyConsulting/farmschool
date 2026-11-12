import { describe, expect, it } from "vitest";
import { certificateStatus } from "./certificates";

describe("certificate validity labels", () => {
  it("does not present legacy records as newly verified", () => {
    expect(certificateStatus({ revoked_at: null, validated_at: null })).toBe("Historical record");
  });
  it("labels a validated record", () => {
    expect(certificateStatus({ revoked_at: null, validated_at: "2026-11-12T12:00:00Z" })).toBe(
      "Completion verified",
    );
  });
  it("gives revocation precedence over validation", () => {
    expect(
      certificateStatus({
        revoked_at: "2026-11-12T13:00:00Z",
        validated_at: "2026-11-12T12:00:00Z",
      }),
    ).toBe("Revoked");
  });
  it("keeps imported and catalogue records distinct from Studio validation", () => {
    expect(certificateStatus({ source: "moodle", revoked_at: null, validated_at: null })).toBe(
      "Completion record",
    );
  });
});
