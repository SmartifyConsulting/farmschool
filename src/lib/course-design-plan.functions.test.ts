import { afterEach, describe, expect, it, vi } from "vitest";
import { designerDefaults } from "./course-design-plan";
import { planUnits, validPlan } from "./course-design-plan.fixtures";
const generate = vi.hoisted(() => vi.fn());
vi.mock("@ai-sdk/openai", () => ({ createOpenAI: () => ({ responses: () => "mock-model" }) }));
vi.mock("ai", () => ({ generateText: generate, Output: { object: (v: unknown) => v } }));
vi.mock("@/integrations/supabase/auth-middleware", () => ({ requireSupabaseAuth: {} }));
vi.mock("@tanstack/react-start", () => ({
  createServerFn: () => {
    let validate = (v: unknown) => v;
    const builder = {
      middleware: () => builder,
      inputValidator: (fn: typeof validate) => {
        validate = fn;
        return builder;
      },
      handler: (fn: (v: unknown) => unknown) => (input: { data: unknown; context: unknown }) =>
        fn({ ...input, data: validate(input.data) }),
    };
    return builder;
  },
}));
import { planCourseDesign } from "./course-design-plan.functions";
function fixture(owned = true) {
  vi.stubEnv("OPENAI_API_KEY", "synthetic-key");
  const objects = new Map<string, Blob>();
  const query = {
    select: () => query,
    eq: () => query,
    in: async () => ({ error: null, data: owned ? [{ id: planUnits[0]!.sourceId }] : [] }),
  };
  const rpc = vi.fn().mockResolvedValue({ data: 1, error: null });
  const storage = {
    download: vi.fn(async (path: string) => ({ data: objects.get(path) ?? null, error: null })),
    upload: vi.fn(async (path: string, blob: Blob, options: { upsert: boolean }) => {
      if (objects.has(path) || options.upsert)
        return { error: { message: "Existing storage policy does not allow replacement" } };
      objects.set(path, blob);
      return { error: null };
    }),
  };
  const call = () =>
    (planCourseDesign as unknown as (v: unknown) => Promise<unknown>)({
      data: {
        requestId: "20000000-0000-4000-8000-000000000001",
        sourceKind: "library",
        choices: designerDefaults,
        units: planUnits,
      },
      context: {
        userId: "owner",
        supabase: { from: () => query, rpc, storage: { from: () => storage } },
      },
    });
  return { call, rpc, storage };
}
afterEach(() => {
  vi.clearAllMocks();
  vi.unstubAllEnvs();
});
describe("saved AI outline planning", () => {
  it("rejects another author's source before storage or quota use", async () => {
    const f = fixture(false);
    await expect(f.call()).rejects.toThrow("own raw");
    expect(f.rpc).not.toHaveBeenCalled();
    expect(generate).not.toHaveBeenCalled();
    expect(f.storage.upload).not.toHaveBeenCalled();
  });
  it("saves and recovers with insert-only storage without spending allowance again", async () => {
    const f = fixture();
    generate.mockResolvedValueOnce({ output: validPlan() });
    await expect(f.call()).resolves.toMatchObject({ title: validPlan().title });
    await expect(f.call()).resolves.toMatchObject({ title: validPlan().title });
    expect(f.rpc).toHaveBeenCalledOnce();
    expect(generate).toHaveBeenCalledOnce();
  });
  it("retains a failed attempt without silently retrying paid requests", async () => {
    const f = fixture();
    generate.mockRejectedValueOnce(Error("AI request failed"));
    await expect(f.call()).rejects.toThrow();
    await expect(f.call()).rejects.toThrow();
    expect(generate).toHaveBeenCalledOnce();
    expect(f.rpc).toHaveBeenCalledOnce();
  });
  it("does not accept a model that silently drops a source section", async () => {
    const f = fixture();
    const plan = validPlan();
    plan.coverage.pop();
    generate.mockResolvedValueOnce({ output: plan });
    await expect(f.call()).rejects.toThrow();
    const saved = JSON.parse(await f.storage.upload.mock.calls.at(-1)![1].text());
    expect(saved.status).toBe("failed");
  });
});
