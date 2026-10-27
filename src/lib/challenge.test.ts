import { describe, expect, it } from "vitest";
import { groundRecommendations } from "./challenge";

describe("AI course and lesson recommendations", () => {
  it("only returns courses and practical lessons that exist in the learning catalogue", () => {
    const result = groundRecommendations({ summary: "Water challenge", nextSteps: [], caution: "", matches: [
      { courseId: "invented-course", reason: "Unknown", lessonIds: ["made-up"] },
      { courseId: "water-quality", reason: "Water testing", lessonIds: ["l1", "made-up", "l3", "l1"] },
      { courseId: "water-quality", reason: "Duplicate", lessonIds: ["l2"] },
    ] });
    expect(result.matches).toEqual([{ courseId: "water-quality", reason: "Water testing", lessonIds: ["l1"] }]);
  });
});