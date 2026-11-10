import { describe, expect, it } from "vitest";
import {
  buildQuiz,
  gradeQuiz,
  loadQuizDraft,
  quizSubmission,
  type WrittenGradeInput,
} from "@/lib/studio-quiz";
import { validateWrittenGrades } from "./written-quiz.server";

const rubric = "Require an explanation that mulch reduces evaporation.";
const input: WrittenGradeInput = {
  index: 2,
  question: "How does mulch help conserve water?",
  response: "Mulch reduces evaporation by covering the soil.",
  rubric,
};

describe("written quiz grading", () => {
  it("stores the rubric in the private key and reopens it only for trainer editing", () => {
    const draft = [{ kind: "written" as const, q: input.question, rubric }];
    const { questions, keys } = buildQuiz(draft);
    expect(questions).toEqual([{ kind: "written", q: input.question }]);
    expect(keys).toEqual([{ rubric }]);
    expect(loadQuizDraft(questions, keys)).toEqual(draft);
    expect(gradeQuiz(questions, keys, [input.response])).toEqual([{ ...input, index: 0 }]);
    expect(
      quizSubmission.safeParse({
        lessonId: "10000000-0000-4000-8000-000000000001",
        answers: [{ rubric }],
      }).success,
    ).toBe(false);
  });

  it("rejects a fabricated passing quote or a grade for the wrong question", () => {
    const grade = {
      index: input.index,
      meetsRubric: true,
      evidence: "Mulch reduces evaporation",
      feedback: "You explained the effect on evaporation.",
    };
    expect(validateWrittenGrades([input], [grade]).get(input.index)).toEqual({
      correct: true,
      feedback: grade.feedback,
    });
    expect(() =>
      validateWrittenGrades(
        [input],
        [{ ...grade, evidence: "The answer correctly described crop yields." }],
      ),
    ).toThrow("Invalid written grade");
    expect(() => validateWrittenGrades([input], [{ ...grade, index: 1 }])).toThrow(
      "Invalid written grade",
    );
    expect(
      validateWrittenGrades([input], [{ ...grade, meetsRubric: false, evidence: null }]).get(
        input.index,
      )?.correct,
    ).toBe(false);
  });
});
