import { expect, it } from "vitest";
import {
  buildQuiz,
  gradeQuiz,
  loadQuizDraft,
  numericMatches,
  numericResponse,
  responseIsComplete,
} from "./studio-quiz";
import { parseQuestionBankFile } from "./question-bank-transfer";

const assessment = () =>
  buildQuiz([
    { kind: "multi", q: "Select crops", options: ["Maize", "", "Bean", "Stone"], answers: [2, 0] },
    { kind: "numeric", q: "Required litres?", value: "10.5", tolerance: "0.1" },
  ]);
it("keeps correct option identities when empty draft options are removed", () => {
  const quiz = assessment();
  expect(quiz.questions[0]).toEqual({
    kind: "multi",
    q: "Select crops",
    options: ["Maize", "Bean", "Stone"],
  });
  expect(quiz.keys[0]).toEqual([0, 1]);
  expect(buildQuiz(loadQuizDraft(quiz.questions, quiz.keys))).toEqual(quiz);
});
it("grades an exact selection set and inclusive numerical tolerance", () => {
  const quiz = assessment();
  expect(gradeQuiz(quiz.questions, quiz.keys, [[1, 0], "10.6"])).toEqual([true, true]);
  expect(gradeQuiz(quiz.questions, quiz.keys, [[0], "10.61"])).toEqual([false, false]);
  expect(gradeQuiz(quiz.questions, quiz.keys, [[0, 1, 2], "1.05e1"])).toEqual([false, true]);
  expect(() => gradeQuiz(quiz.questions, quiz.keys, [[0, 0], "10.5"])).toThrow("Answer every");
  expect(responseIsComplete(quiz.questions[0]!, [])).toBe(false);
});
it("rejects ambiguous, out-of-range and unrepresentable numerical input", () => {
  for (const value of ["", "1,5", "0x10", "10 kg", "NaN", "Infinity", "1e13", "1e-9999"])
    expect(numericResponse(value)).toBeNull();
  expect(numericResponse("-2.5e2")).toBe(-250);
  expect(numericResponse("0e-20")).toBe(0);
  expect(numericMatches(0.3, 0.2, 0.1)).toBe(true);
  expect(numericMatches(0.30000000000000004, 0.3, 0)).toBe(false);
});
it("refuses invalid private keys instead of silently awarding grades", () => {
  expect(() =>
    buildQuiz([{ kind: "multi", q: "Pick", options: ["A", "B"], answers: [1, 1] }]),
  ).toThrow();
  expect(() => buildQuiz([{ kind: "numeric", q: "Count", value: "2", tolerance: "-1" }])).toThrow();
  const quiz = assessment();
  expect(() =>
    gradeQuiz(quiz.questions, [[0, 0], { value: 10.5, tolerance: 0.1 }], [[0], "10.5"]),
  ).toThrow("not ready");
});
it("preserves both formats and private keys in native question-bank files", () => {
  const quiz = assessment();
  const entries = quiz.questions.map((question, index) => ({
    category: "Training",
    question,
    answer: quiz.keys[index],
  }));
  expect(
    parseQuestionBankFile(
      JSON.stringify({ format: "plusticity-question-bank", version: 1, entries }),
    ),
  ).toEqual(entries);
});
