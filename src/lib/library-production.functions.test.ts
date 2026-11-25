import { afterEach, describe, expect, it, vi } from "vitest";
const generate = vi.hoisted(() =>
  vi.fn().mockResolvedValue({ output: { body: "Teaching material" } }),
);
vi.mock("@ai-sdk/openai", () => ({ createOpenAI: () => ({ responses: () => "mock-model" }) }));
vi.mock("ai", () => ({ generateText: generate, Output: { object: (value: unknown) => value } }));
vi.mock("@/integrations/supabase/auth-middleware", () => ({ requireSupabaseAuth: {} }));
vi.mock("@tanstack/react-start", () => ({
  createServerFn: () => {
    let validate = (value: unknown) => value;
    const builder = {
      middleware: () => builder,
      inputValidator: (fn: typeof validate) => {
        validate = fn;
        return builder;
      },
      handler:
        (fn: (input: unknown) => unknown) => async (input: { data: unknown; context: unknown }) =>
          fn({ ...input, data: validate(input.data) }),
    };
    return builder;
  },
}));
import { produceLibraryLesson } from "./library-production.functions";
const id = "10000000-0000-4000-8000-000000000001";
function invoke({ allowed = true, quota = true, text = "source", index = 0, count = 2 } = {}) {
  vi.stubEnv("OPENAI_API_KEY", "synthetic-test-key");
  const rpc = vi.fn().mockResolvedValue({ data: quota ? 1 : null, error: null });
  const query = {
    select: () => query,
    eq: () => query,
    in: async () => ({ data: allowed ? [{ id }] : [], error: null }),
  };
  const promise = (produceLibraryLesson as unknown as (input: unknown) => Promise<unknown>)({
    data: {
      sourceIds: [id],
      title: "Lesson",
      sourceText: text,
      instruction: "Teach this",
      sectionIndex: index,
      sectionCount: count,
    },
    context: { userId: "owner", supabase: { from: () => query, rpc } },
  });
  return { promise, rpc };
}
afterEach(() => {
  vi.clearAllMocks();
  vi.unstubAllEnvs();
});
describe("section request safeguards", () => {
  it("checks ownership before reserving any allowance", async () => {
    const { promise, rpc } = invoke({ allowed: false });
    await expect(promise).rejects.toThrow("own Raw");
    expect(rpc).not.toHaveBeenCalled();
    expect(generate).not.toHaveBeenCalled();
  });
  it("makes no AI call when allowance is exhausted", async () => {
    await expect(invoke({ quota: false }).promise).rejects.toThrow("allowance");
    expect(generate).not.toHaveBeenCalled();
  });
  it("reserves allowance for each section and passes its position to the model", async () => {
    for (let index = 0; index < 2; index++) {
      const { promise, rpc } = invoke({ index });
      await expect(promise).resolves.toEqual({ body: "Teaching material" });
      expect(rpc).toHaveBeenCalledExactlyOnceWith("course_factory_reserve_ai_request");
    }
    expect(generate).toHaveBeenCalledTimes(2);
    expect(JSON.parse(generate.mock.calls[1]![0].prompt).section).toBe("2 of 2");
  });
  it("rejects invalid positions and oversized sections before AI or quota calls", async () => {
    await expect(invoke({ index: 2, count: 2 }).promise).rejects.toThrow();
    await expect(invoke({ text: "x".repeat(100_001) }).promise).rejects.toThrow();
    expect(generate).not.toHaveBeenCalled();
  });
});
