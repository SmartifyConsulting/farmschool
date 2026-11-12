import { describe, expect, it } from "vitest";
import { exportMoodleQuestionXml, importMoodleQuestionXml } from "./moodle-question-xml";
import { buildQuiz, type QuizDraftQuestion } from "./studio-quiz";
const drafts: QuizDraftQuestion[] = [
  { kind: "choice", q: "Choose <one> & explain", options: ["Maize", "Rice"], answer: 1 },
  { kind: "boolean", q: "Water required?", answer: 0 },
  { kind: "blank", q: "Name a crop", accepted: "maize\ncorn" },
  {
    kind: "match",
    q: "Match crops",
    pairs: [
      { left: "Maize", right: "Cereal" },
      { left: "Bean", right: "Legume" },
    ],
  },
  {
    kind: "written",
    q: "Explain rotation",
    rubric: "Award credit for explaining soil nutrients and changing crops.",
  },
];
const entry = (draft: QuizDraftQuestion) => {
  const built = buildQuiz([draft]);
  return { category: "Training & safety", question: built.questions[0], answer: built.keys[0] };
};
describe("Moodle XML question transfer", () => {
  it("round trips all five supported question kinds and private grading information", () => {
    const entries = drafts.map(entry);
    const xml = exportMoodleQuestionXml(entries);
    expect(xml.startsWith('<?xml version="1.0"')).toBe(true);
    expect(importMoodleQuestionXml(xml)).toEqual(entries);
  });
  it("reads basic formatted Moodle text without executing or loading content", () => {
    const xml =
      '<quiz><question type="truefalse"><questiontext format="html"><text><![CDATA[<p>Water &amp; soil?</p>]]></text></questiontext><answer fraction="100"><text>true</text></answer><answer fraction="0"><text>false</text></answer></question></quiz>';
    expect(importMoodleQuestionXml(xml)[0]?.question.q).toBe("Water & soil?");
  });
  it.each([
    '<!DOCTYPE quiz [<!ENTITY xxe SYSTEM "file:///secret">]><quiz/>',
    '<quiz><question type="numerical"/></quiz>',
    '<quiz><question type="essay"><questiontext><text>Explain</text></questiontext></question></quiz>',
    '<quiz><question type="truefalse"><questiontext><text><![CDATA[<img src="https://example.invalid/pixel">]]></text></questiontext></question></quiz>',
    "<quiz><question></quiz>",
  ])("rejects unsupported or unsafe XML instead of partially importing", (xml) =>
    expect(() => importMoodleQuestionXml(xml)).toThrow(),
  );
  it("rejects partial-credit options", () => {
    const xml =
      '<quiz><question type="multichoice"><questiontext><text>Choose</text></questiontext><answer fraction="100"><text>A</text></answer><answer fraction="50"><text>B</text></answer></question></quiz>';
    expect(() => importMoodleQuestionXml(xml)).toThrow("Partial-credit");
  });
});
