import { createHmac } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock("@/integrations/supabase/client.server", () => ({ supabaseAdmin: { rpc: mocks.rpc } }));
import { handleStripeLearningWebhook } from "./stripe-learning.server";

const session = {
  id: "cs_purchase",
  created: 100,
  payment_status: "paid",
  mode: "payment",
  amount_total: 2000,
  currency: "usd",
  metadata: {
    course_id: "10000000-0000-4000-8000-000000000001",
    user_id: "10000000-0000-4000-8000-000000000002",
  },
};
function request(type: string, object: unknown, signature = true) {
  const payload = JSON.stringify({ id: "evt_test", type, created: 200, data: { object } });
  const timestamp = Math.floor(Date.now() / 1000);
  const digest = createHmac("sha256", "test-secret")
    .update(`${timestamp}.${payload}`)
    .digest("hex");
  return new Request("https://example.test/api/stripe-webhook", {
    method: "POST",
    body: payload,
    headers: { "stripe-signature": signature ? `t=${timestamp},v1=${digest}` : "invalid" },
  });
}
beforeEach(() => {
  vi.stubEnv("STRIPE_WEBHOOK_SECRET", "test-secret");
  vi.stubEnv("STRIPE_SECRET_KEY", "sk_test_mock");
  mocks.rpc.mockReset().mockResolvedValue({ error: null });
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => Response.json({ data: [session], has_more: false })),
  );
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("course payment webhook", () => {
  const bulk = {
    ...session,
    amount_total: 4000,
    metadata: {
      ...session.metadata,
      purchase_kind: "cohort_license",
      license_order_id: "10000000-0000-4000-8000-000000000003",
      cohort_id: "10000000-0000-4000-8000-000000000004",
      quantity: "2",
      price_cents: "2000",
      currency: "usd",
    },
  };
  it("routes verified bulk purchases to the licence processor only", async () => {
    expect(
      (await handleStripeLearningWebhook(request("checkout.session.completed", bulk))).status,
    ).toBe(200);
    expect(mocks.rpc).toHaveBeenCalledWith("apply_cohort_license_payment", {
      _event: expect.objectContaining({ action: "paid", session: bulk }),
    });
    expect(mocks.rpc).toHaveBeenCalledTimes(1);
  });
  it("routes bulk refunds through the same order lifecycle", async () => {
    vi.mocked(fetch).mockResolvedValue(Response.json({ data: [bulk], has_more: false }));
    expect(
      (
        await handleStripeLearningWebhook(
          request("charge.refunded", { refunded: true, payment_intent: "pi_bulk" }),
        )
      ).status,
    ).toBe(200);
    expect(mocks.rpc).toHaveBeenCalledWith("apply_cohort_license_payment", {
      _event: expect.objectContaining({ action: "refunded", session: bulk }),
    });
  });
  it("retains named seats for partial refunds under the existing refund policy", async () => {
    expect(
      (
        await handleStripeLearningWebhook(
          request("charge.refunded", { refunded: false, payment_intent: "pi_bulk_partial" }),
        )
      ).status,
    ).toBe(200);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it("does not grant personal access for an incomplete bulk purchase", async () => {
    expect(
      (
        await handleStripeLearningWebhook(
          request("checkout.session.completed", {
            ...bulk,
            metadata: { ...bulk.metadata, license_order_id: undefined },
          }),
        )
      ).status,
    ).toBe(400);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it("rejects unknown purchase kinds instead of treating them as personal payments", async () => {
    expect(
      (
        await handleStripeLearningWebhook(
          request("checkout.session.completed", {
            ...bulk,
            metadata: { ...bulk.metadata, purchase_kind: "unknown" },
          }),
        )
      ).status,
    ).toBe(400);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it.each(["checkout.session.completed", "checkout.session.async_payment_succeeded"])(
    "records verified paid purchases: %s",
    async (type) => {
      expect((await handleStripeLearningWebhook(request(type, session))).status).toBe(200);
      expect(mocks.rpc).toHaveBeenCalledWith("apply_learning_payment_event", {
        _event: expect.objectContaining({ action: "paid", session }),
      });
    },
  );
  it("rejects invalid signatures without reading payment state", async () => {
    expect(
      (await handleStripeLearningWebhook(request("checkout.session.completed", session, false)))
        .status,
    ).toBe(400);
    expect(mocks.rpc).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
  });
  it("does not grant access to unpaid checkouts", async () => {
    await handleStripeLearningWebhook(
      request("checkout.session.completed", { ...session, payment_status: "unpaid" }),
    );
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it("preserves access for partial refunds", async () => {
    await handleStripeLearningWebhook(
      request("charge.refunded", { refunded: false, payment_intent: "pi_test" }),
    );
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it.each([
    {
      type: "charge.refunded",
      object: { refunded: true, payment_intent: "pi_test" },
      action: "refunded",
    },
    {
      type: "charge.dispute.created",
      object: { payment_intent: "pi_test" },
      action: "dispute_open",
    },
    {
      type: "charge.dispute.closed",
      object: { payment_intent: "pi_test", status: "won" },
      action: "dispute_won",
    },
    {
      type: "charge.dispute.closed",
      object: { payment_intent: "pi_test", status: "lost" },
      action: "dispute_lost",
    },
    {
      type: "charge.dispute.closed",
      object: { payment_intent: "pi_test", status: "warning_closed" },
      action: "dispute_won",
    },
  ])("reconciles purchase status: $action", async ({ type, object, action }) => {
    expect((await handleStripeLearningWebhook(request(type, object))).status).toBe(200);
    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining("payment_intent=pi_test"),
      expect.anything(),
    );
    expect(mocks.rpc).toHaveBeenCalledWith("apply_learning_payment_event", {
      _event: expect.objectContaining({ action, session }),
    });
  });
  it("requests a retry when Stripe lookup fails", async () => {
    vi.mocked(fetch).mockResolvedValue(new Response("Unavailable", { status: 500 }));
    expect(
      (
        await handleStripeLearningWebhook(
          request("charge.refunded", { refunded: true, payment_intent: "pi_test" }),
        )
      ).status,
    ).toBe(503);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it("requests a retry when database processing fails", async () => {
    mocks.rpc.mockResolvedValue({ error: { message: "Unavailable" } });
    expect(
      (await handleStripeLearningWebhook(request("checkout.session.completed", session))).status,
    ).toBe(503);
  });
  it("ignores non-course purchases", async () => {
    vi.mocked(fetch).mockResolvedValue(
      Response.json({ data: [{ ...session, metadata: {} }], has_more: false }),
    );
    expect(
      (
        await handleStripeLearningWebhook(
          request("charge.refunded", { refunded: true, payment_intent: "pi_test" }),
        )
      ).status,
    ).toBe(200);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
});
