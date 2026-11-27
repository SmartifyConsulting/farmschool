import { describe, it, expect } from "vitest";
import { initialOutline, sourceUnits, topicKey } from "./training-design";
import {
  conformTrainingSlideTools,
  defaultSlideTools,
  changeSlideTool,
  slideToolProblems,
  toolsFromEditedBody,
} from "./training-slide-tools";
const units = sourceUnits("source", "Manual", [
  { page: 1, text: "Source instructions for applying this procedure correctly." },
]);
const topic = {
  ...initialOutline(units)[0]!,
  slides: 5,
  headings: ["Learn: Rules", "See: Example", "Apply: Practice", "Reflect: Why", "Confirm: Check"],
};
describe("per-slide learning tools", () => {
  it("preserves unsolicited widget content as prose while leaving selected tools interactive", () => {
    const planned = {
      ...topic,
      tools: ["explanation", "columns", "scenario", "quizcheck"] as typeof topic.tools,
      slideTools: [
        ["explanation"],
        ["columns"],
        ["scenario"],
        [],
        ["quizcheck"],
      ] as (typeof topic.tools)[],
    };
    const quiz =
      ":::quizcheck\n### What should happen?\nA*: Report promptly\nA: Wait\nH: Follow the procedure.\n:::";
    const body = topic.headings
      .map(
        (h, i) =>
          `## ${h}\nTeaching instructions.${i === 1 ? "\n\n:::columns\nFirst\n---col---\nSecond\n:::" : ""}${i === 2 || i === 4 ? "\n\n" + quiz : ""}`,
      )
      .join("\n\n");
    const normalized = conformTrainingSlideTools(planned, body);
    expect(slideToolProblems(planned, normalized)).toEqual([]);
    expect(normalized).toContain("Suggested response: Report promptly");
    expect(normalized).toContain("Follow the procedure.");
    expect(normalized.match(/:::quizcheck/g)).toHaveLength(1);
    expect(normalized).toContain(":::columns");
  });
  it("places tools in the intended methodology stage rather than every slide", () => {
    expect(
      defaultSlideTools(topic.headings, [
        "explanation",
        "columns",
        "scenario",
        "flip",
        "quizcheck",
      ]),
    ).toEqual([["explanation"], ["columns"], ["scenario"], ["flip"], ["quizcheck"]]);
  });
  it("changes only the selected row, updates freshness and rejects misplaced widgets", () => {
    const original = { ...topic, slideTools: defaultSlideTools(topic.headings, topic.tools) };
    const changed = { ...original, ...changeSlideTool(original, 1, "tabs", true) };
    expect(changed.slideTools[1]).toContain("tabs");
    expect(changed.slideTools[0]).toEqual(original.slideTools[0]);
    expect(topicKey(changed, units, "")).not.toBe(topicKey(original, units, ""));
    expect(
      slideToolProblems(changed, topic.headings.map((h) => `## ${h}\nTeaching text.`).join("\n\n")),
    ).toContain(`Restore the selected learning tools on slide 2 of ${topic.title}.`);
  });
  it("keeps manual webpart additions aligned with their slide selections", () => {
    const body = topic.headings
      .map(
        (h, i) =>
          `## ${h}\nTeaching.${i === 1 ? "\n\n:::tabs\n### One\nFirst example\n### Two\nSecond example\n:::" : ""}`,
      )
      .join("\n\n");
    const edited = { ...topic, ...toolsFromEditedBody(topic, body) };
    expect(edited.slideTools[1]).toContain("tabs");
    expect(slideToolProblems(edited, body)).toEqual([]);
  });
});
