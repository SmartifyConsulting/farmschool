import { describe, expect, it } from "vitest";
import { certificateStatus } from "./certificates";

describe("certificate validity labels", () => {
  it("marks expiry at the exact boundary and keeps revocation first", () => {
    const certificate = {
      validated_at: "2026-01-01T00:00:00Z",
      revoked_at: null,
      expires_at: "2026-02-01T00:00:00Z",
    };
    expect(certificateStatus(certificate, Date.parse("2026-01-31T23:59:59Z"))).toBe(
      "Completion verified",
    );
    expect(certificateStatus(certificate, Date.parse(certificate.expires_at))).toBe("Expired");
    expect(
      certificateStatus(
        { ...certificate, revoked_at: "2026-01-31T00:00:00Z" },
        Date.parse(certificate.expires_at),
      ),
    ).toBe("Revoked");
  });
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
