import { afterEach, describe, it, expect, vi } from "vitest";
const generate = vi.hoisted(() => vi.fn());
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
      handler: (fn: (value: unknown) => unknown) => (input: { data: unknown; context: unknown }) =>
        fn({ ...input, data: validate(input.data) }),
    };
    return builder;
  },
}));
import { generateTrainingTopic } from "./training-design.functions";
import { initialOutline, sourceUnits } from "./training-design";
const units = sourceUnits("10000000-0000-4000-8000-000000000001", "Policy.pdf", [
  { page: 1, text: "Explain the reporting procedure and record concerns without investigating." },
]);
function request(allowed = true, quota = true) {
  vi.stubEnv("OPENAI_API_KEY", "synthetic-key");
  const rpc = vi.fn().mockResolvedValue({ data: quota ? 1 : null, error: null });
  const query = {
    select: () => query,
    eq: () => query,
    in: async () => ({ data: allowed ? [{ id: units[0]!.sourceId }] : [], error: null }),
  };
  return {
    rpc,
    promise: (generateTrainingTopic as unknown as (v: unknown) => Promise<unknown>)({
      data: {
        title: "Policy",
        instruction: "Teach every topic",
        budget: 6000,
        topic: initialOutline(units)[0],
        units,
      },
      context: { userId: "owner", supabase: { from: () => query, rpc } },
    }),
  };
}
afterEach(() => {
  vi.clearAllMocks();
  vi.unstubAllEnvs();
});
describe("topic generation safeguards", () => {
  it("rejects foreign sources before using allowance", async () => {
    const r = request(false);
    await expect(r.promise).rejects.toThrow("own Raw");
    expect(r.rpc).not.toHaveBeenCalled();
    expect(generate).not.toHaveBeenCalled();
  });
  it("makes no model request when quota is exhausted", async () => {
    await expect(request(true, false).promise).rejects.toThrow("allowance");
    expect(generate).not.toHaveBeenCalled();
  });
  it("rejects model claims that omit assigned sections", async () => {
    generate.mockResolvedValueOnce({ output: { coveredUnitIds: [], slides: [] } });
    await expect(request().promise).rejects.toThrow("omitted source");
  });
  it("rejects output missing planned interactive tools", async () => {
    generate.mockResolvedValueOnce({
      output: {
        coveredUnitIds: units.map((u) => u.id),
        slides: Array.from({ length: 3 }, (_, i) => ({
          title: `Slide ${i}`,
          body: "Teaching text without its required interactive components.",
        })),
      },
    });
    await expect(request().promise).rejects.toThrow("component");
  });
  it("generates exactly the planned topic with source coverage and components", async () => {
    generate.mockResolvedValueOnce({
      output: {
        coveredUnitIds: units.map((u) => u.id),
        slides: [
          {
            title: "Reporting",
            body: "The source procedure tells you how to record and report concerns.\n\n:::columns\nRecord the concern\n---col---\nReport through the approved route\n:::",
          },
          {
            title: "Apply",
            body: "A hypothetical learner tells you about a concern. Apply the documented source procedure.",
          },
          {
            title: "Check",
            body: ":::quizcheck\n### What should you do?\nA*: Record and report the concern\nA: Investigate it yourself\nH: Follow the reporting route.\n:::",
          },
        ],
      },
    });
    const r = request();
    await expect(r.promise).resolves.toMatchObject({
      body: expect.stringContaining("## " + initialOutline(units)[0]!.headings[0]),
    });
    expect(r.rpc).toHaveBeenCalledOnce();
    expect(generate.mock.calls[0]![0].system).toContain("EVERY supplied source section");
  });
});
