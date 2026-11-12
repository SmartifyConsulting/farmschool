import { z } from "zod";
import { readBankQuestion } from "./question-bank";
import { buildQuiz } from "./studio-quiz";

const envelope = z.object({
  format: z.literal("plusticity-question-bank"),
  version: z.literal(1),
  entries: z
    .array(
      z.object({
        category: z.string().trim().min(1).max(80),
        question: z.unknown(),
        answer: z.unknown(),
      }),
    )
    .max(500),
});
export const QUESTION_BANK_FILE_LIMIT = 10 * 1024 * 1024;
export function parseQuestionBankFile(text: string) {
  if (new TextEncoder().encode(text).byteLength > QUESTION_BANK_FILE_LIMIT)
    throw new Error("Choose a question file under 10 MB.");
  const parsed = envelope.parse(JSON.parse(text));
  if (!parsed.entries.length) throw new Error("This question file is empty.");
  return parsed.entries.map((entry) => {
    const built = buildQuiz([readBankQuestion(entry.question, entry.answer)]);
    const question = built.questions[0];
    const answer = built.keys[0];
    if (!question || answer === undefined)
      throw new Error("This question file contains an incomplete question.");
    return { category: entry.category, question, answer };
  });
}
