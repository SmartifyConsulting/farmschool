import { z } from "zod";

const choiceIndex = z.number().int().min(0).max(49);
const option = z.string().max(500);
const prompt = z.string().trim().min(1).max(500);
export const writtenResponseLimit = 2000;
export const writtenRubricLimit = 2000;
export const writtenQuestionsLimit = 5;
const rubricSchema = z.string().trim().min(20).max(writtenRubricLimit);

const questionSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("choice"), q: prompt, options: z.array(option).min(2).max(50) }),
  z.object({ kind: z.literal("multi"), q: prompt, options: z.array(option).min(2).max(50) }),
  z.object({ kind: z.literal("numeric"), q: prompt }),
  z.object({ kind: z.literal("boolean"), q: prompt }),
  z.object({ kind: z.literal("blank"), q: prompt }),
  z.object({ kind: z.literal("written"), q: prompt }),
  z.object({
    kind: z.literal("match"),
    q: prompt,
    left: z.array(option).min(2).max(8),
    right: z.array(option).min(2).max(8),
  }),
]);

export type QuizQuestion = z.infer<typeof questionSchema>;
export type QuestionKind = QuizQuestion["kind"];

const responseSchema = z.union([
  choiceIndex,
  z.string().trim().min(1).max(writtenResponseLimit),
  z.array(choiceIndex).min(1).max(50),
]);
export const quizSubmission = z.object({
  lessonId: z.string().uuid(),
  attemptId: z.string().uuid().optional(),
  answers: z.array(responseSchema).min(1).max(50),
});
export type QuizResponse = z.infer<typeof responseSchema>;

const keySchema = z.union([
  choiceIndex,
  z.array(z.string().trim().min(1).max(500)).min(1).max(10),
  z.array(choiceIndex).min(1).max(50),
  z.object({ rubric: rubricSchema }),
  z.object({
    value: z.number().finite().min(-1e12).max(1e12),
    tolerance: z.number().finite().min(0).max(1e12),
  }),
]);
type QuizKey = z.infer<typeof keySchema>;

export type QuizDraftQuestion =
  | { kind: "choice"; q: string; options: string[]; answer: number }
  | { kind: "multi"; q: string; options: string[]; answers: number[] }
  | { kind: "numeric"; q: string; value: string; tolerance: string }
  | { kind: "boolean"; q: string; answer: number }
  | { kind: "blank"; q: string; accepted: string }
  | { kind: "written"; q: string; rubric: string }
  | { kind: "match"; q: string; pairs: { left: string; right: string }[] };

export const questionLabels: Record<QuestionKind, string> = {
  choice: "Multiple choice",
  multi: "Select all correct answers",
  numeric: "Numerical answer",
  boolean: "True / false",
  blank: "Fill in the blank",
  written: "Written response (AI graded)",
  match: "Matching pairs",
};
export const trueFalseOptions = ["True", "False"];

export function newQuizQuestion(kind: QuestionKind, q = ""): QuizDraftQuestion {
  switch (kind) {
    case "choice":
      return { kind, q, options: ["", "", "", ""], answer: -1 };
    case "multi":
      return { kind, q, options: ["", "", "", ""], answers: [] };
    case "numeric":
      return { kind, q, value: "", tolerance: "0" };
    case "boolean":
      return { kind, q, answer: -1 };
    case "blank":
      return { kind, q, accepted: "" };
    case "written":
      return { kind, q, rubric: "" };
    case "match":
      return {
        kind,
        q,
        pairs: [
          { left: "", right: "" },
          { left: "", right: "" },
        ],
      };
  }
}

export function parseQuizQuestions(raw: unknown): QuizQuestion[] | null {
  if (!Array.isArray(raw)) return null;
  const result = z
    .array(questionSchema)
    .max(50)
    .safeParse(
      raw.map((value: unknown) => {
        if (value && typeof value === "object" && !("kind" in value)) {
          const legacy = value as { q?: unknown; question?: unknown; options?: unknown };
          return { kind: "choice", q: legacy.q ?? legacy.question, options: legacy.options };
        }
        return value;
      }),
    );
  return result.success ? result.data : null;
}

export function loadQuizDraft(questions: QuizQuestion[], rawKeys: unknown): QuizDraftQuestion[] {
  const keys: unknown[] = Array.isArray(rawKeys) ? rawKeys : [];
  return questions.map((question, i) => {
    const key = keySchema.safeParse(keys[i]);
    const answer = key.success ? key.data : undefined;
    switch (question.kind) {
      case "choice":
        return {
          ...question,
          options: [
            ...question.options,
            ...Array<string>(Math.max(0, 4 - question.options.length)).fill(""),
          ],
          answer: typeof answer === "number" ? answer : -1,
        };
      case "boolean":
        return { ...question, answer: typeof answer === "number" ? answer : -1 };
      case "multi":
        return {
          ...question,
          options: [
            ...question.options,
            ...Array<string>(Math.max(0, 4 - question.options.length)).fill(""),
          ],
          answers:
            Array.isArray(answer) && answer.every((item) => typeof item === "number") ? answer : [],
        };
      case "numeric":
        return {
          ...question,
          value:
            answer && typeof answer === "object" && "value" in answer ? String(answer.value) : "",
          tolerance:
            answer && typeof answer === "object" && "tolerance" in answer
              ? String(answer.tolerance)
              : "0",
        };
      case "blank":
        return {
          ...question,
          accepted: Array.isArray(answer) && typeof answer[0] === "string" ? answer.join("\n") : "",
        };
      case "written":
        return {
          ...question,
          rubric: answer && typeof answer === "object" && "rubric" in answer ? answer.rubric : "",
        };
      case "match":
        return {
          kind: "match",
          q: question.q,
          pairs: question.left.map((left, row) => {
            const target = Array.isArray(answer) ? answer[row] : null;
            return {
              left,
              right: typeof target === "number" ? (question.right[target] ?? "") : "",
            };
          }),
        };
    }
  });
}

const normalize = (value: string) =>
  value.normalize("NFKC").trim().toLowerCase().replace(/\s+/gu, " ");
const allDifferent = (values: string[]) => new Set(values.map(normalize)).size === values.length;
export function numericResponse(value: unknown): number | null {
  if (
    typeof value !== "string" ||
    value.trim().length > 64 ||
    !/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/.test(value.trim())
  )
    return null;
  const number = Number(value);
  if (number === 0 && /[1-9]/.test(value.trim().split(/[eE]/)[0]!)) return null;
  return Number.isFinite(number) && Math.abs(number) <= 1e12 ? number : null;
}
export function numericMatches(actual: number, expected: number, tolerance: number): boolean {
  const difference = Math.abs(actual - expected);
  return (
    difference <= tolerance ||
    (tolerance > 0 &&
      difference - tolerance <= Number.EPSILON * 4 * Math.max(1, difference, tolerance))
  );
}

export function buildQuiz(draft: QuizDraftQuestion[]): {
  questions: QuizQuestion[];
  keys: QuizKey[];
} {
  if (!draft.length || draft.length > 50) throw new Error("Add between 1 and 50 questions.");
  if (draft.filter((question) => question.kind === "written").length > writtenQuestionsLimit) {
    throw new Error("Add up to five written responses per quiz.");
  }
  const questions: QuizQuestion[] = [];
  const keys: QuizKey[] = [];
  for (const [i, question] of draft.entries()) {
    const error = (message: string): never => {
      throw new Error("Question " + (i + 1) + ": " + message);
    };
    const q = question.q.trim();
    if (!prompt.safeParse(q).success) error("Enter a prompt of up to 500 characters.");
    if (question.kind === "choice") {
      const options = question.options.map((item) => item.trim());
      if (!z.array(option).max(50).safeParse(options).success)
        error("Each option must be at most 500 characters.");
      if (options.filter(Boolean).length < 2 || !allDifferent(options.filter(Boolean)))
        error("Enter at least two different options.");
      if (!options[question.answer]) error("Select a correct option that has text.");
      const selected = options[question.answer];
      const filled = options.filter(Boolean);
      questions.push({ kind: "choice", q, options: filled });
      keys.push(filled.indexOf(selected!));
    } else if (question.kind === "multi") {
      const options = question.options.map((item) => item.trim());
      const filled = options.filter(Boolean);
      if (
        !z.array(option).max(50).safeParse(options).success ||
        filled.length < 2 ||
        !allDifferent(filled)
      )
        error("Enter at least two different options, up to 500 characters each.");
      if (
        !question.answers.length ||
        new Set(question.answers).size !== question.answers.length ||
        question.answers.some((index) => !Number.isInteger(index) || index < 0 || !options[index])
      )
        error("Select one or more correct options with text.");
      questions.push({ kind: "multi", q, options: filled });
      keys.push(
        question.answers.map((index) => filled.indexOf(options[index]!)).sort((a, b) => a - b),
      );
    } else if (question.kind === "numeric") {
      const value = numericResponse(question.value);
      const tolerance = numericResponse(question.tolerance);
      if (value === null || tolerance === null || tolerance < 0)
        error("Enter a finite answer and a nonnegative absolute tolerance, within one trillion.");
      questions.push({ kind: "numeric", q });
      keys.push({ value: value!, tolerance: tolerance! });
    } else if (question.kind === "boolean") {
      if (question.answer !== 0 && question.answer !== 1)
        error("Select True or False as the correct answer.");
      questions.push({ kind: "boolean", q });
      keys.push(question.answer);
    } else if (question.kind === "blank") {
      const accepted = question.accepted
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean);
      if (!keySchema.safeParse(accepted).success)
        error("Enter 1 to 10 accepted answers, one per line.");
      questions.push({ kind: "blank", q });
      keys.push(accepted);
    } else if (question.kind === "written") {
      const rubric = rubricSchema.safeParse(question.rubric);
      if (!rubric.success) error("Write a rubric of 20 to 2,000 characters.");
      else {
        questions.push({ kind: "written", q });
        keys.push({ rubric: rubric.data });
      }
    } else {
      const left = question.pairs.map((pair) => pair.left.trim());
      const matches = question.pairs.map((pair) => pair.right.trim());
      if (
        left.length < 2 ||
        left.length > 8 ||
        [...left, ...matches].some((item) => !item || item.length > 500) ||
        !allDifferent(left) ||
        !allDifferent(matches)
      ) {
        error("Enter 2 to 8 complete pairs with distinct prompts and matches.");
      }
      const right = [...matches].sort();
      if (right.every((item, row) => item === matches[row])) right.push(right.shift()!);
      questions.push({ kind: "match", q, left, right });
      keys.push(matches.map((item) => right.indexOf(item)));
    }
  }
  return { questions, keys };
}

export function responseIsComplete(
  question: QuizQuestion,
  value: QuizResponse | undefined,
): boolean {
  switch (question.kind) {
    case "blank":
      return typeof value === "string" && !!value.trim() && value.trim().length <= 500;
    case "written":
      return (
        typeof value === "string" && !!value.trim() && value.trim().length <= writtenResponseLimit
      );
    case "choice":
      return typeof value === "number" && !!question.options[value]?.trim();
    case "multi":
      return (
        Array.isArray(value) &&
        value.length > 0 &&
        value.length <= question.options.length &&
        new Set(value).size === value.length &&
        value.every(
          (index) => Number.isInteger(index) && index >= 0 && !!question.options[index]?.trim(),
        )
      );
    case "numeric":
      return numericResponse(value) !== null;
    case "boolean":
      return value === 0 || value === 1;
    case "match":
      return (
        Array.isArray(value) &&
        value.length === question.left.length &&
        new Set(value).size === value.length &&
        value.every((index) => index >= 0 && index < question.right.length)
      );
  }
}

export type WrittenGradeInput = {
  index: number;
  question: string;
  response: string;
  rubric: string;
};

/** Score fixed answers locally and prepare written questions for the server grader. */
export function gradeQuiz(
  questions: QuizQuestion[],
  rawKeys: unknown,
  responses: QuizResponse[],
): (boolean | WrittenGradeInput)[] {
  const keys = z.array(keySchema).safeParse(rawKeys);
  if (!questions.length || !keys.success || keys.data.length !== questions.length)
    throw new Error("This quiz is not ready to be graded.");
  if (
    responses.length !== questions.length ||
    questions.some((question, i) => !responseIsComplete(question, responses[i]))
  ) {
    throw new Error("Answer every question before submitting.");
  }
  if (questions.filter((question) => question.kind === "written").length > writtenQuestionsLimit) {
    throw new Error("This quiz has too many written questions to grade.");
  }
  return questions.map((question, i) => {
    const key = keys.data[i];
    const response = responses[i];
    if (
      question.kind === "numeric" &&
      key &&
      typeof key === "object" &&
      "value" in key &&
      "tolerance" in key
    ) {
      return numericMatches(numericResponse(response)!, key.value, key.tolerance);
    }
    if (
      question.kind === "multi" &&
      Array.isArray(key) &&
      key.every((item) => typeof item === "number") &&
      responseIsComplete(question, key) &&
      Array.isArray(response)
    ) {
      return key.length === response.length && key.every((item) => response.includes(item));
    }
    if (
      question.kind === "written" &&
      typeof response === "string" &&
      key &&
      typeof key === "object" &&
      "rubric" in key
    ) {
      return { index: i, question: question.q, response, rubric: key.rubric };
    }
    if (
      question.kind === "blank" &&
      Array.isArray(key) &&
      key.every((item) => typeof item === "string") &&
      typeof response === "string"
    ) {
      return key.some((item) => normalize(item) === normalize(response));
    }
    if (
      question.kind === "match" &&
      Array.isArray(key) &&
      key.every((item) => typeof item === "number") &&
      Array.isArray(response) &&
      responseIsComplete(question, key)
    ) {
      return key.every((item, row) => item === response[row]);
    }
    if (
      (question.kind === "choice" || question.kind === "boolean") &&
      typeof key === "number" &&
      responseIsComplete(question, key)
    ) {
      return key === response;
    }
    throw new Error("This quiz is not ready to be graded.");
  });
}
