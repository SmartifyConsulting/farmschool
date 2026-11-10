import { describe, expect, it } from "vitest";
import {
  buildQuiz,
  gradeQuiz,
  loadQuizDraft,
  parseQuizQuestions,
  type QuizDraftQuestion,
} from "./studio-quiz";

const draft: QuizDraftQuestion[] = [
  { kind: "choice", q: "Choose a soil type", options: ["", "Clay", "", "Sand"], answer: 3 },
  { kind: "boolean", q: "Sandy soil drains slowly", answer: 1 },
  { kind: "blank", q: "Use ___ to protect the soil", accepted: "mulch\ncrop residue" },
  {
    kind: "match",
    q: "Match soil to its texture",
    pairs: [
      { left: "Clay", right: "Sticky" },
      { left: "Sand", right: "Gritty" },
    ],
  },
];

describe("Studio quiz formats", () => {
  it("keeps private keys separate and grades all four formats", () => {
    const { questions, keys } = buildQuiz(draft);
    expect(JSON.stringify(questions)).not.toContain("crop residue");
    expect(questions[3]).toMatchObject({ left: ["Clay", "Sand"], right: ["Gritty", "Sticky"] });
    expect(gradeQuiz(questions, keys, [1, 1, " CROP  residue ", [1, 0]])).toEqual([
      true,
      true,
      true,
      true,
    ]);
    expect(gradeQuiz(questions, keys, [0, 0, "straw", [0, 1]])).toEqual([
      false,
      false,
      false,
      false,
    ]);
    expect(() => gradeQuiz(questions, keys, [1, 1, "mulch", [0, 0]])).toThrow(
      "Answer every question",
    );
  });

  it("reopens saved matching pairs and accepted answers for trainers", () => {
    const { questions, keys } = buildQuiz(draft);
    const loaded = loadQuizDraft(questions, keys);
    expect(loaded[2]).toEqual(draft[2]);
    expect(loaded[3]).toEqual(draft[3]);
    expect(buildQuiz(loaded)).toEqual({ questions, keys });
  });

  it("grades existing handwritten and generated choices with their original indexes", () => {
    const questions = parseQuizQuestions([
      { q: "Which tool?", options: ["", "Spade", "", "Hoe"] },
      { question: "Which crop?", options: ["Maize", "Beans", "Peas", "Millet"] },
    ]);
    expect(questions).not.toBeNull();
    expect(gradeQuiz(questions!, [3, 0], [3, 0])).toEqual([true, true]);
    expect(() => gradeQuiz(questions!, [3, 0], [1])).toThrow("Answer every question");
  });

  it("rejects incomplete trainer keys and invalid saved keys", () => {
    expect(() => buildQuiz([{ kind: "boolean", q: "A statement", answer: -1 }])).toThrow(
      "Select True or False",
    );
    const { questions } = buildQuiz(draft);
    expect(() => gradeQuiz(questions, [1, 1, ["mulch"], [0, 0]], [1, 1, "mulch", [1, 0]])).toThrow(
      "not ready",
    );
  });
});
