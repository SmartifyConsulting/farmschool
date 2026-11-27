import { describe, expect, it } from "vitest";
import { buildCourseDraft } from "./course-factory";
import { stripRepeatedHeaderFooterLines } from "./document-extraction";
import { studioTrainingOutline, trainingOutlineGroups } from "./studio-training-outline";
import { generationProblems } from "./training-design";
const id = "10000000-0000-4000-8000-000000000001";
describe("Studio outline reuse", () => {
  it("preserves procedure steps and recognises continued chapters and annex resources",()=>{
    const pages=[{sourceId:id,page:1,text:"3. Reporting concerns\nFollow the required procedure.\n2. Listen: remain calm, record the disclosure and explain what happens next\n"+"Keep this procedure with its source chapter. ".repeat(8)},{sourceId:id,page:2,text:"3. Reporting — case management\n"+"Assign and monitor the report. ".repeat(10)},{sourceId:id,page:3,text:"Annex A. Reporting form\n"+"Use the fields in the original reporting form. ".repeat(8)},{sourceId:id,page:4,text:"Annex B. References\nBibliographic reference material only."}];
    const draft=buildCourseDraft("Reporting",pages);
    expect(draft.lessons.some(lesson=>lesson.title.startsWith("2. Listen"))).toBe(false);
    expect(draft.lessons.map(lesson=>lesson.body).join(" ")).toContain("2. Listen: remain calm");
    expect(draft.lessons.some(lesson=>lesson.module==="3. Reporting — case management")).toBe(false);
    expect(draft.lessons.some(lesson=>lesson.module==="Annex A. Reporting form")).toBe(true);
    expect(draft.lessons.some(lesson=>lesson.body.includes("Bibliographic reference"))).toBe(false);
  });
  it("uses Studio's exact teaching sections and source provenance", () => {
    const pages = [
      { sourceId: id, page: 1, text: "Training manual\nCopyright\nAll rights reserved" },
      {
        sourceId: id,
        page: 2,
        text: "Contents\n1. Reporting concerns .... 3\n2. Safer recruitment .... 4",
      },
      {
        sourceId: id,
        page: 3,
        text:
          "1. Reporting concerns\n" +
          "Record and refer concerns using the required procedure. ".repeat(12),
      },
      {
        sourceId: id,
        page: 4,
        text:
          "2. Safer recruitment\n" +
          "Check references and follow the recruitment procedure. ".repeat(12),
      },
    ];
    const expected = buildCourseDraft("Policy", pages);
    const actual = studioTrainingOutline(id, "Policy.pdf", pages);
    expect(actual.topics.map((topic) => topic.title)).toEqual(
      expected.lessons.map((lesson) => lesson.title),
    );
    expect(actual.units.map((unit) => unit.text)).toEqual(
      expected.lessons.map((lesson) => lesson.body),
    );
    expect(
      actual.topics.every(
        (topic) =>
          topic.slides === 5 &&
          topic.headings[0]?.startsWith("Learn:") &&
          topic.headings[4]?.startsWith("Confirm:"),
      ),
    ).toBe(true);
    expect(actual.units.some((unit) => unit.text.includes("Copyright"))).toBe(false);
    expect(actual.units.map((unit) => unit.page)).toEqual([3, 4]);
    expect(generationProblems(actual.topics, actual.units)).toEqual([]);
    expect(trainingOutlineGroups(actual.topics, actual.units)).toHaveLength(2);
  });
  it("retains the shared repeated header/footer cleanup", () => {
    const pages = Array.from({ length: 4 }, (_, i) => ({
      sourceId: id,
      page: i + 1,
      text: `Policy — internal\n${i + 1}. Topic ${String.fromCharCode(65 + i)}\n${"Keep substantive learner content. ".repeat(12)} Unique topic ${String.fromCharCode(65 + i)}\nPage ${i + 1} of 4`,
    }));
    const clean = stripRepeatedHeaderFooterLines(pages);
    const prepared = studioTrainingOutline(id, "Policy.pdf", clean);
    expect(
      prepared.units.every(
        (unit) => !unit.text.includes("Policy — internal") && !unit.text.includes("of 4"),
      ),
    ).toBe(true);
    expect(prepared.units.map((unit) => unit.text).join(" ")).toContain(
      "Keep substantive learner content",
    );
  });
});
