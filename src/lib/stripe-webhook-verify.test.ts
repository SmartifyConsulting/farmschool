import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { verifyStripeSignature } from "./stripe-webhook-verify";

describe("verifyStripeSignature", () => {
  const secret = "whsec_test";
  const payload = JSON.stringify({ type: "checkout.session.completed" });

  function sign(ts: number, body: string) {
    return (
      "t=" +
      ts +
      ",v1=" +
      createHmac("sha256", secret)
        .update(ts + "." + body)
        .digest("hex")
    );
  }

  it("accepts a correctly signed, recent payload", () => {
    const header = sign(Math.floor(Date.now() / 1000), payload);
    expect(verifyStripeSignature(payload, header, secret)).toBe(true);
  });
  it("rejects a tampered payload", () => {
    const header = sign(Math.floor(Date.now() / 1000), payload);
    expect(verifyStripeSignature(payload + "x", header, secret)).toBe(false);
  });
  it("rejects a stale timestamp (replay protection)", () => {
    const header = sign(Math.floor(Date.now() / 1000) - 10000, payload);
    expect(verifyStripeSignature(payload, header, secret)).toBe(false);
  });
  it("rejects a missing header", () => {
    expect(verifyStripeSignature(payload, null, secret)).toBe(false);
  });
});
