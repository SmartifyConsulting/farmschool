import { describe, expect, it } from "vitest";
import { appendBankQuestion, readBankQuestion } from "./question-bank";
import { buildQuiz, type QuizDraftQuestion } from "./studio-quiz";

const examples: [
  QuizDraftQuestion,
  QuizDraftQuestion,
  QuizDraftQuestion,
  QuizDraftQuestion,
  QuizDraftQuestion,
] = [
  { kind: "choice", q: "Choose a crop", options: ["Wheat", "", "Rice", ""], answer: 2 },
  { kind: "boolean", q: "Water is required", answer: 0 },
  { kind: "blank", q: "Name the crop", accepted: "maize\ncorn" },
  {
    kind: "written",
    q: "Explain crop rotation",
    rubric: "Award credit for explaining soil nutrients and changing crops.",
  },
  {
    kind: "match",
    q: "Match crops",
    pairs: [
      { left: "Maize", right: "Cereal" },
      { left: "Bean", right: "Legume" },
    ],
  },
];

describe("private question library copies", () => {
  it.each(examples)("round trips $kind with its private answer", (draft) => {
    const built = buildQuiz([draft]);
    expect(buildQuiz([readBankQuestion(built.questions[0], built.keys[0])])).toEqual(built);
  });
  it("copies options instead of mutating the library or existing quiz", () => {
    const built = buildQuiz([examples[0]]);
    const existing = [structuredClone(examples[1])];
    const imported = appendBankQuestion(existing, built.questions[0], built.keys[0]);
    const importedQuestion = imported[1];
    if (importedQuestion?.kind === "choice") importedQuestion.options[0] = "Changed";
    expect(built.questions[0]).toEqual({
      kind: "choice",
      q: "Choose a crop",
      options: ["Wheat", "Rice"],
    });
    expect(existing).toHaveLength(1);
  });
  it("rejects the fifty-first question", () => {
    expect(() =>
      appendBankQuestion(Array(50).fill(examples[1]), { kind: "boolean", q: "One more" }, 0),
    ).toThrow("50");
  });
  it("rejects the sixth written response while allowing other kinds", () => {
    const existing = Array(5).fill(examples[3]);
    const written = buildQuiz([examples[3]]);
    expect(() => appendBankQuestion(existing, written.questions[0], written.keys[0])).toThrow(
      "five",
    );
    expect(appendBankQuestion(existing, { kind: "boolean", q: "One more" }, 0)).toHaveLength(6);
  });
  it.each([
    [{ kind: "boolean", q: "Question" }, null],
    [{ kind: "choice", q: "Question", options: ["A", "B"] }, 9],
    [{ kind: "written", q: "Question" }, { rubric: "Too short" }],
    [{ kind: "unknown", q: "Question" }, 0],
  ])("rejects invalid stored material", (question, answer) => {
    expect(() => readBankQuestion(question, answer)).toThrow();
  });
});
