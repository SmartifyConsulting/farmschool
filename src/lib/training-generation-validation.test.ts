import { describe, expect, it } from "vitest";
import {
  coverageProblems,
  generationProblems,
  initialOutline,
  sourceUnits,
} from "./training-design";
import { trainingGenerationPlan, runTrainingGeneration } from "./training-generation";

const units = sourceUnits(
  "10000000-0000-4000-8000-000000000001",
  "Beekeeping.pdf",
  Array.from({ length: 52 }, (_, index) => ({
    page: index + 1,
    text: `${index + 1}. Beekeeping topic\n${"Source-supported instruction and practical procedures. ".repeat(10)}`,
  })),
);
const outline = () => initialOutline(units);
describe("selected training generation", () => {
  it("generates one selected topic from a 52-topic outline without a whole-outline cap", async () => {
    const topics = outline();
    const selected = topics[8]!.id;
    expect(topics).toHaveLength(52);
    expect(generationProblems(topics, units, [selected])).toEqual([]);
    const plan = trainingGenerationPlan(
      topics,
      units,
      {},
      "teach",
      { images: false, videos: false },
      [selected],
    );
    const generated: string[] = [];
    await runTrainingGeneration(plan, {
      stopped: () => false,
      progress: () => {},
      slides: async (topic) => {
        generated.push(topic.id);
      },
      image: async () => {
        throw Error("Unexpected image charge");
      },
      video: async () => {
        throw Error("Unexpected video charge");
      },
      attach: () => {},
    });
    expect(generated).toEqual([selected]);
  });
  it("allows sequential generation of all 52 topics and retains the supported 250-topic limit", () => {
    const topics = outline();
    expect(generationProblems(topics, units)).toEqual([]);
    expect(
      trainingGenerationPlan(topics, units, {}, "teach", { images: false, videos: false }),
    ).toHaveLength(52);
    const oversized = Array.from({ length: 251 }, (_, i) => ({ ...topics[0]!, id: `topic-${i}` }));
    expect(generationProblems(oversized, units, [oversized[0]!.id])).toContain(
      "Use at most 250 topics per output.",
    );
  });
  it("does not let unrelated unfinished topics block selected work, but prevents completion", () => {
    const topics = outline();
    topics[1]!.objective = "";
    topics[1]!.unitIds = [];
    expect(generationProblems(topics, units, [topics[0]!.id])).toEqual([]);
    expect(generationProblems(topics, units)).not.toEqual([]);
    const completion = coverageProblems(topics, units, {}, "teach");
    expect(completion.some((issue) => issue.includes("Unassigned source"))).toBe(true);
    expect(completion.some((issue) => issue.includes("Complete the headings"))).toBe(true);
  });
  it("blocks invalid selected topics and unavailable or empty selections", () => {
    const topics = outline();
    topics[0]!.unitIds = ["missing-section"];
    expect(generationProblems(topics, units, topics[0]!.id).join(" ")).toContain(
      "available source",
    );
    expect(generationProblems(topics, units, [])).toContain("Choose available topics to generate.");
    expect(generationProblems(topics, units, ["deleted-topic"])).toContain(
      "Choose available topics to generate.",
    );
  });
  it("checks readability only for assigned selected sources and keeps per-topic size limits", () => {
    const topics = outline();
    const poor = units.map((u, i) => (i === 1 ? { ...u, text: "Unreadable" } : u));
    expect(generationProblems(topics, poor, topics[0]!.id)).toEqual([]);
    expect(generationProblems(topics, poor, topics[1]!.id).join(" ")).toContain("OCR");
    const large = units.map((u, i) => (i === 0 ? { ...u, text: "x".repeat(30001) } : u));
    expect(generationProblems(topics, large, topics[0]!.id).join(" ")).toContain("smaller topics");
  });
});
