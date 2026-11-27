import { describe, expect, it } from "vitest";
import {
  LEARNING_BLUEPRINTS,
  LEARNING_BLUEPRINT_IDS,
  DEFAULT_COURSE_METHODOLOGY,
  SUPPORTING_DESIGN_MODELS,
  learningBlueprintInstruction,
} from "./course-methodology";
import { initialOutline, sourceUnits, generationProblems, topicSchema } from "./training-design";
import { wizardDefaults } from "./course-wizard";
describe("Learning Blueprint library", () => {
  it("includes all twelve frameworks and nine supporting models from the referenced library", () => {
    expect(LEARNING_BLUEPRINTS).toHaveLength(12);
    expect(new Set(LEARNING_BLUEPRINT_IDS).size).toBe(12);
    expect(SUPPORTING_DESIGN_MODELS).toHaveLength(9);
    expect(wizardDefaults.learningBlueprint).toBe(DEFAULT_COURSE_METHODOLOGY);
  });
  it("supports every framework's actual stage count, including Gagné's nine events", () => {
    const units = sourceUnits("10000000-0000-4000-8000-000000000001", "Policy.pdf", [
      { page: 1, text: "Source-grounded steps for handling a concern. ".repeat(20) },
    ]);
    for (const blueprint of LEARNING_BLUEPRINTS) {
      const topic = {
        ...initialOutline(units)[0]!,
        methodology: blueprint.id,
        slides: blueprint.stages.length,
        headings: blueprint.stages.map((stage) => stage + ": Example"),
        tools: blueprint.tools,
      };
      expect(topicSchema.safeParse(topic).success).toBe(true);
      expect(generationProblems([topicSchema.parse(topic)], units)).toEqual([]);
      expect(learningBlueprintInstruction(blueprint.id)).toContain(blueprint.assessment);
    }
  });
  it("flags missing stages and avoids treating a quiz as observed practical competence", () => {
    const units = sourceUnits("10000000-0000-4000-8000-000000000001", "Procedure.pdf", [
      { page: 1, text: "A practical task with source-grounded steps. ".repeat(20) },
    ]);
    const topic = { ...initialOutline(units)[0]!, methodology: DEFAULT_COURSE_METHODOLOGY };
    expect(generationProblems([topic], units).join(" ")).toContain("stages in order");
    expect(learningBlueprintInstruction("peyton")).toContain(
      "do not claim that an online quiz establishes practical competence",
    );
  });
});
