import { describe, it, expect } from "vitest";
import { lessonProseParts } from "./lesson-prose";
describe("rendered teaching prose", () => {
  it("recognises a list immediately after its label, plus subsequent paragraphs and headings", () => {
    expect(
      lessonProseParts(
        "Key duties:\n- **Report** immediately\n- Record facts\n\nNext action\n### Reflect\n1. Consider\n2. Explain",
      ),
    ).toEqual([
      { kind: "paragraph", text: "Key duties:" },
      { kind: "bullets", items: ["**Report** immediately", "Record facts"] },
      { kind: "paragraph", text: "Next action" },
      { kind: "heading", level: 3, text: "Reflect" },
      { kind: "numbers", items: ["Consider", "Explain"] },
    ]);
  });
  it("keeps source text intact and treats HTML as text", () => {
    expect(lessonProseParts("<script>alert(1)</script>\nSource: Policy.pdf")).toEqual([
      { kind: "paragraph", text: "<script>alert(1)</script>\nSource: Policy.pdf" },
    ]);
  });
});
