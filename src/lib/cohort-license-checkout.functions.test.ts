import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ userRpc: vi.fn(), adminRpc: vi.fn(), fetch: vi.fn() }));
vi.mock("@tanstack/react-start", () => ({
  createServerFn: () => {
    const builder = {
      middleware: () => builder,
      validator: () => builder,
      handler: (handler: unknown) => handler,
    };
    return builder;
  },
}));
vi.mock("@/integrations/supabase/auth-middleware", () => ({ requireSupabaseAuth: {} }));
vi.mock("@/integrations/supabase/client.server", () => ({
  supabaseAdmin: { rpc: mocks.adminRpc },
}));
import { createCohortLicenseCheckout } from "./cohort-license-checkout.functions";
const ids = {
  buyer: "10000000-0000-4000-8000-000000000001",
  cohort: "10000000-0000-4000-8000-000000000002",
  course: "10000000-0000-4000-8000-000000000003",
  order: "10000000-0000-4000-8000-000000000004",
  request: "10000000-0000-4000-8000-000000000005",
};
const order = {
  id: ids.order,
  request_id: ids.request,
  buyer_id: ids.buyer,
  cohort_id: ids.cohort,
  course_id: ids.course,
  course_title: "Training",
  quantity: 2,
  unit_price_cents: 2000,
  currency: "usd",
  status: "pending",
  checkout_url: null,
  created_at: "2026-11-12T12:00:00Z",
};
const invoke = createCohortLicenseCheckout as unknown as (args: unknown) => Promise<unknown>;
const input = () => ({
  data: {
    cohortId: ids.cohort,
    courseId: ids.course,
    quantity: 2,
    requestId: ids.request,
    unitPriceCents: 1,
  },
  context: { userId: ids.buyer, supabase: { rpc: mocks.userRpc } },
});
beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv("STRIPE_SECRET_KEY", "test-only-placeholder");
  vi.stubEnv("SITE_URL", "https://learning.example.invalid");
  vi.stubGlobal("fetch", mocks.fetch);
  mocks.userRpc.mockImplementation(async (name) => ({
    data: name === "cohort_billing_destination" ? null : order,
    error: null,
  }));
  mocks.adminRpc.mockResolvedValue({ error: null });
  mocks.fetch.mockResolvedValue(
    Response.json({ id: "cs_bulk_fixture", url: "https://checkout.stripe.com/c/pay/fixture" }),
  );
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});
describe("paid cohort checkout", () => {
  it("returns organization buyers to their own workspace", async () => {
    const organization = "10000000-0000-4000-8000-000000000006";
    mocks.userRpc.mockImplementation(async (name) => ({
      data: name === "cohort_billing_destination" ? organization : order,
      error: null,
    }));
    await invoke(input());
    const body = (mocks.fetch.mock.calls[0]?.[1] as RequestInit).body as URLSearchParams;
    const destination = new URL(body.get("success_url")!);
    expect(destination.pathname).toBe("/organizations/" + organization);
    expect(destination.searchParams.get("cohort")).toBe(ids.cohort);
    expect(destination.searchParams.get("license_order")).toBe(ids.order);
  });
  it("does not contact the provider when buyer return scope cannot be verified", async () => {
    mocks.userRpc.mockImplementation(async (name) =>
      name === "cohort_billing_destination"
        ? { data: null, error: { message: "Access denied" } }
        : { data: order, error: null },
    );
    await expect(invoke(input())).rejects.toThrow("return address");
    expect(mocks.fetch).not.toHaveBeenCalled();
  });
  it("uses the saved price and quantity rather than client pricing", async () => {
    expect(await invoke(input())).toEqual({
      kind: "checkout",
      url: "https://checkout.stripe.com/c/pay/fixture",
    });
    const options = mocks.fetch.mock.calls[0]?.[1] as RequestInit;
    const body = options.body as URLSearchParams;
    expect(body.get("line_items[0][price_data][unit_amount]")).toBe("2000");
    expect(body.get("line_items[0][quantity]")).toBe("2");
    expect(body.get("metadata[license_order_id]")).toBe(ids.order);
    expect(body.get("metadata[purchase_kind]")).toBe("cohort_license");
    const returnUrl = new URL(body.get("success_url")!);
    expect(returnUrl.searchParams.get("cohort")).toBe(ids.cohort);
    expect(returnUrl.searchParams.get("license_order")).toBe(ids.order);
    expect(options.headers).toMatchObject({ "Idempotency-Key": "cohort-license/" + ids.order });
    expect(mocks.adminRpc).toHaveBeenCalledWith("bind_course_license_checkout", {
      _order: ids.order,
      _session: "cs_bulk_fixture",
      _url: "https://checkout.stripe.com/c/pay/fixture",
    });
  });
  it("resumes a saved session without creating another checkout", async () => {
    mocks.userRpc.mockResolvedValue({
      data: { ...order, checkout_url: "https://checkout.stripe.com/c/pay/existing" },
      error: null,
    });
    expect(await invoke(input())).toEqual({
      kind: "checkout",
      url: "https://checkout.stripe.com/c/pay/existing",
    });
    expect(mocks.fetch).not.toHaveBeenCalled();
  });
  it("does not charge an already confirmed purchase again", async () => {
    mocks.userRpc.mockResolvedValue({ data: { ...order, status: "active" }, error: null });
    expect(await invoke(input())).toEqual({ kind: "purchased" });
    expect(mocks.fetch).not.toHaveBeenCalled();
  });
  it("requires a new request for refunded or disputed purchases", async () => {
    mocks.userRpc.mockResolvedValue({ data: { ...order, status: "refunded" }, error: null });
    expect(await invoke(input())).toHaveProperty("error");
    expect(mocks.fetch).not.toHaveBeenCalled();
  });
  it("does not call Stripe when cohort authorisation fails", async () => {
    mocks.userRpc.mockResolvedValue({ data: null, error: { message: "Not owner" } });
    await expect(invoke(input())).rejects.toMatchObject({ message: "Not owner" });
    expect(mocks.fetch).not.toHaveBeenCalled();
  });
  it("requires the returned order to belong to the signed-in buyer", async () => {
    mocks.userRpc.mockResolvedValue({ data: { ...order, buyer_id: ids.cohort }, error: null });
    await expect(invoke(input())).rejects.toThrow("Could not confirm");
    expect(mocks.fetch).not.toHaveBeenCalled();
  });
  it("fails closed if provider creation fails", async () => {
    mocks.fetch.mockResolvedValue(new Response("Unavailable", { status: 503 }));
    expect(await invoke(input())).toHaveProperty("error");
    expect(mocks.adminRpc).not.toHaveBeenCalled();
  });
  it("does not release an unrecorded checkout link", async () => {
    mocks.adminRpc.mockResolvedValue({ error: { message: "Unavailable" } });
    const result = await invoke(input());
    expect(result).toHaveProperty("error");
    expect(result).not.toHaveProperty("url");
  });
  it("does not create orders without configured payments", async () => {
    vi.stubEnv("STRIPE_SECRET_KEY", "");
    expect(await invoke(input())).toHaveProperty("error");
    expect(mocks.userRpc).not.toHaveBeenCalled();
    expect(mocks.fetch).not.toHaveBeenCalled();
  });
  it("rejects unsafe return addresses", async () => {
    vi.stubEnv("SITE_URL", "https://user:password@learning.example.invalid");
    await expect(invoke(input())).rejects.toThrow("secure checkout");
    expect(mocks.userRpc).not.toHaveBeenCalled();
  });
});
