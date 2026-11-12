import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ from: vi.fn(), result: vi.fn(), fetch: vi.fn() }));
vi.mock("@tanstack/react-start", () => ({
  createServerFn: () => {
    const b = { middleware: () => b, validator: () => b, handler: (h: unknown) => h };
    return b;
  },
}));
vi.mock("@/integrations/supabase/auth-middleware", () => ({ requireSupabaseAuth: {} }));
import { resumeCohortLicenseCheckout } from "./cohort-license-resume.functions";
const ids = {
  buyer: "10000000-0000-4000-8000-000000000001",
  cohort: "10000000-0000-4000-8000-000000000002",
  order: "10000000-0000-4000-8000-000000000003",
  course: "10000000-0000-4000-8000-000000000004",
};
const order = () => ({
  id: ids.order,
  request_id: ids.order,
  buyer_id: ids.buyer,
  cohort_id: ids.cohort,
  course_id: ids.course,
  course_title: "Company course",
  quantity: 1,
  unit_price_cents: 2000,
  currency: "usd",
  status: "pending",
  checkout_url: "https://checkout.stripe.com/fixture",
  created_at: new Date().toISOString(),
});
const invoke = () =>
  (resumeCohortLicenseCheckout as unknown as (input: unknown) => Promise<unknown>)({
    data: { cohortId: ids.cohort, orderId: ids.order },
    context: { userId: "another-authorized-billing-manager", supabase: { from: mocks.from } },
  });
beforeEach(() => {
  vi.resetAllMocks();
  vi.stubGlobal("fetch", mocks.fetch);
  const b = { select: () => b, eq: () => b, maybeSingle: mocks.result };
  mocks.from.mockReturnValue(b);
  mocks.result.mockResolvedValue({ data: order(), error: null });
});
afterEach(() => vi.unstubAllGlobals());
describe("delegated checkout resume", () => {
  it("reuses a bound RLS-authorized checkout without new provider requests", async () => {
    expect(await invoke()).toEqual({
      kind: "checkout",
      url: "https://checkout.stripe.com/fixture",
    });
    expect(mocks.fetch).not.toHaveBeenCalled();
  });
  it("does not release a checkout denied by row permissions", async () => {
    mocks.result.mockResolvedValue({ data: null, error: null });
    await expect(invoke()).rejects.toThrow("not available");
  });
  it("retains active purchases and does not recreate an unbound buyer request", async () => {
    mocks.result.mockResolvedValueOnce({ data: { ...order(), status: "active" }, error: null });
    expect(await invoke()).toEqual({ kind: "purchased" });
    mocks.result.mockResolvedValueOnce({ data: { ...order(), checkout_url: null }, error: null });
    expect(await invoke()).toMatchObject({ error: expect.stringContaining("original buyer") });
    expect(mocks.fetch).not.toHaveBeenCalled();
  });
  it("rejects stale and unsafe checkout addresses", async () => {
    mocks.result.mockResolvedValueOnce({
      data: { ...order(), created_at: "2020-01-01T00:00:00Z" },
      error: null,
    });
    expect(await invoke()).toMatchObject({ error: expect.stringContaining("expired") });
    mocks.result.mockResolvedValueOnce({
      data: { ...order(), checkout_url: "javascript:alert(1)" },
      error: null,
    });
    await expect(invoke()).rejects.toThrow("secure");
  });
});
