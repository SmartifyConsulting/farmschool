import { describe, expect, it } from "vitest";
import { recoverableTrainingPackage } from "./training-workspace-recovery";
import { initialOutline, sourceUnits, packageSchema } from "./training-design";
describe("unfinished training recovery", () => {
  it("retains blank edited fields while strict completed packages still reject them", () => {
    const topic = initialOutline(
      sourceUnits("source", "Policy.pdf", [
        { page: 1, text: "1. Safeguarding\n" + "Source evidence. ".repeat(60) },
      ]),
    )[0]!;
    const working = {
      version: 1,
      title: "",
      instruction: "",
      topics: [
        {
          ...topic,
          title: "",
          module: "",
          objective: "",
          tools: [],
          unitIds: [],
          headings: [],
          slides: null,
        },
      ],
      results: {},
    };
    const parsed = recoverableTrainingPackage.parse(working);
    expect(parsed.topics[0]?.title).toBe("");
    expect(parsed.topics[0]?.slides).toBe(0);
    expect(packageSchema.safeParse(parsed).success).toBe(false);
  });
});
