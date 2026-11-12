import { afterEach, beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ from: vi.fn(), rpc: vi.fn(), fetch: vi.fn(), upsert: vi.fn() }));
vi.mock("@tanstack/react-start", () => ({
  createServerFn: () => {
    const builder = {
      middleware: () => builder,
      inputValidator: () => builder,
      handler: (handler: unknown) => handler,
    };
    return builder;
  },
}));
vi.mock("@/integrations/supabase/auth-middleware", () => ({ requireSupabaseAuth: {} }));
vi.mock("@/integrations/supabase/client.server", () => ({
  supabaseAdmin: { from: () => ({ upsert: mocks.upsert }) },
}));
import { createCheckoutSession } from "./checkout.functions";
import { learningPortalReturn } from "./portal-checkout";

const courseId = "10000000-0000-4000-8000-000000000001";
let price: number;
const invoke = createCheckoutSession as unknown as (input: unknown) => Promise<unknown>;
const input = (portalSlug?: string) => ({
  data: { courseId, portalSlug },
  context: { userId: "learner", supabase: { from: mocks.from, rpc: mocks.rpc } },
});
beforeEach(() => {
  vi.resetAllMocks();
  price = 2500;
  vi.stubEnv("STRIPE_SECRET_KEY", "test-only-placeholder");
  vi.stubEnv("SITE_URL", "https://training.example.invalid/");
  vi.stubGlobal("fetch", mocks.fetch);
  mocks.rpc.mockResolvedValue({ data: { name: "Customer" }, error: null });
  mocks.upsert.mockResolvedValue({ error: null });
  mocks.fetch.mockResolvedValue(
    Response.json({ url: "https://checkout.stripe.com/c/pay/fixture" }),
  );
  mocks.from.mockImplementation((table) => {
    const chain = {
      select: () => chain,
      eq: () => chain,
      maybeSingle: async () => ({
        data:
          table === "studio_courses"
            ? {
                id: courseId,
                title: "Training",
                price_cents: price,
                currency: "usd",
                published: true,
                prerequisite_course_id: null,
              }
            : null,
        error: null,
      }),
    };
    return chain;
  });
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

it("returns both purchase outcomes to the same validated customer course", async () => {
  await expect(invoke(input("acme-training"))).resolves.toEqual({
    kind: "checkout",
    url: "https://checkout.stripe.com/c/pay/fixture",
  });
  expect(mocks.rpc).toHaveBeenCalledWith("portal_learning_brand", {
    _slug: "acme-training",
    _course: courseId,
  });
  const body = mocks.fetch.mock.calls[0]![1].body as URLSearchParams;
  for (const field of ["success_url", "cancel_url"]) {
    const url = new URL(body.get(field)!);
    expect(url.origin).toBe("https://training.example.invalid");
    expect(url.pathname).toBe("/class/" + courseId);
    expect(url.searchParams.get("portal")).toBe("acme-training");
  }
  expect(new URL(body.get("success_url")!).searchParams.get("enrolled")).toBe("1");
  expect(body.get("line_items[0][price_data][unit_amount]")).toBe("2500");
});

it.each([false, true])(
  "denies unavailable portal access before paid or free enrolment (free=%s)",
  async (free) => {
    price = free ? 0 : 2500;
    mocks.rpc.mockResolvedValue({ data: null, error: null });
    await expect(invoke(input("acme-training"))).resolves.toEqual({
      error: "This course is not available through your training portal.",
    });
    expect(mocks.from).not.toHaveBeenCalled();
    expect(mocks.upsert).not.toHaveBeenCalled();
    expect(mocks.fetch).not.toHaveBeenCalled();
  },
);

it("fails closed when portal validation fails", async () => {
  mocks.rpc.mockResolvedValue({ data: { name: "Stale" }, error: { message: "unavailable" } });
  await expect(invoke(input("acme-training"))).resolves.toHaveProperty("error");
  expect(mocks.fetch).not.toHaveBeenCalled();
});

it("preserves direct enrolment without introducing portal membership", async () => {
  price = 0;
  await expect(invoke(input())).resolves.toEqual({ kind: "enrolled" });
  expect(mocks.upsert).toHaveBeenCalledWith(
    expect.objectContaining({ amount_cents: 0, payment_status: "free", user_id: "learner" }),
    expect.anything(),
  );
  expect(mocks.rpc).not.toHaveBeenCalledWith("portal_learning_brand", expect.anything());
  expect(mocks.fetch).not.toHaveBeenCalled();
});

it("rejects unsafe configured return origins and redirect injection", async () => {
  for (const url of [
    "http://training.example.invalid",
    "https://user:pass@training.example.invalid",
    "https://training.example.invalid/path",
    "https://training.example.invalid?next=outside",
    "javascript:alert(1)",
  ])
    expect(() => learningPortalReturn(url, courseId, "acme-training")).toThrow();
  for (const slug of ["//outside.example", "acme?next=outside", "acme#x", "../admin"])
    expect(() =>
      learningPortalReturn("https://training.example.invalid", courseId, slug),
    ).toThrow();
  vi.stubEnv("SITE_URL", "https://user:pass@training.example.invalid");
  await expect(invoke(input())).resolves.toHaveProperty(
    "error",
    "The application checkout address needs to be configured.",
  );
  expect(mocks.fetch).not.toHaveBeenCalled();
});
