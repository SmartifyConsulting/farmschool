import { describe, expect, it } from "vitest";
import { parseQuestionBankFile } from "./question-bank-transfer";
import { buildQuiz, type QuizDraftQuestion } from "./studio-quiz";

const drafts: QuizDraftQuestion[] = [
  { kind: "choice", q: "Choose", options: ["Maize", "Rice"], answer: 0 },
  { kind: "boolean", q: "Water required?", answer: 1 },
  { kind: "blank", q: "Name a crop", accepted: "maize\ncorn" },
  {
    kind: "written",
    q: "Explain rotation",
    rubric: "Award credit for changing crops to protect soil nutrients.",
  },
  {
    kind: "match",
    q: "Match",
    pairs: [
      { left: "Maize", right: "Cereal" },
      { left: "Bean", right: "Legume" },
    ],
  },
];
const file = (entries: unknown[]) =>
  JSON.stringify({ format: "plusticity-question-bank", version: 1, entries });
describe("question library transfer", () => {
  it("preserves every supported question kind and its answer on transfer", () => {
    const entries = drafts.map((draft) => {
      const built = buildQuiz([draft]);
      return { category: "Training", question: built.questions[0], answer: built.keys[0] };
    });
    expect(parseQuestionBankFile(file(entries))).toEqual(entries);
  });
  it("rejects an invalid answer before any import is attempted", () => {
    expect(() =>
      parseQuestionBankFile(
        file([{ category: "Training", question: { kind: "boolean", q: "Question" }, answer: 9 }]),
      ),
    ).toThrow();
  });
  it("rejects unrecognised formats and versions", () => {
    expect(() =>
      parseQuestionBankFile(JSON.stringify({ format: "other", version: 1, entries: [] })),
    ).toThrow();
    expect(() =>
      parseQuestionBankFile(
        JSON.stringify({ format: "plusticity-question-bank", version: 2, entries: [] }),
      ),
    ).toThrow();
  });
  it("rejects empty or oversized batches instead of silently truncating", () => {
    expect(() => parseQuestionBankFile(file([]))).toThrow("empty");
    expect(() =>
      parseQuestionBankFile(
        file(
          Array(501).fill({
            category: "Training",
            question: { kind: "boolean", q: "Question" },
            answer: 0,
          }),
        ),
      ),
    ).toThrow();
  });
});
