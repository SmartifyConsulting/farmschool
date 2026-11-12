import {
  buildQuiz,
  loadQuizDraft,
  parseQuizQuestions,
  type QuizDraftQuestion,
} from "./studio-quiz";

export function readBankQuestion(question: unknown, answer: unknown): QuizDraftQuestion {
  const parsed = parseQuizQuestions([question]);
  if (!parsed?.length) throw new Error("This library question could not be loaded.");
  const draft = loadQuizDraft(parsed, [answer])[0];
  if (!draft) throw new Error("This library question could not be loaded.");
  buildQuiz([draft]);
  return draft;
}

export function appendBankQuestion(
  current: QuizDraftQuestion[],
  question: unknown,
  answer: unknown,
) {
  const added = readBankQuestion(question, answer);
  if (current.length >= 50) throw new Error("A quiz can contain up to 50 questions.");
  if (added.kind === "written" && current.filter((q) => q.kind === "written").length >= 5)
    throw new Error("A quiz can contain up to five written responses.");
  return [...current, added];
}
