import type { DraftCourse } from "./course-factory";

export type QuizSuggestion = {
  question: string;
  suggestedAnswer: string;
  sourceId: string;
  page: number;
  requiresReview: true;
};

/**
 * Suggest only review prompts supported by a complete explanatory source sentence.
 * Headings, contents lists and short fragments are not assessable evidence.
 * These are trainer prompts, not scored or AI-generated quizzes.
 */
export function suggestReviewQuestions(draft: DraftCourse, limit = 20): QuizSuggestion[] {
  if (!Number.isInteger(limit) || limit < 1 || limit > 100) throw new Error("Limit must be 1–100.");
  const result: QuizSuggestion[] = [];
  const seen = new Set<string>();
  for (const lesson of draft.lessons) {
    if (result.length >= limit) break;
    const source = lesson.sourceRefs[0];
    if (!source) continue;
    const paragraphs = lesson.body.split(/\n\s*\n/).map(x => x.replace(/\s+/g, " ").trim());
    const excerpt = paragraphs.flatMap(p => p.match(/[^.!?]+[.!?](?=\s|$)/g) ?? [])
      .map(x => x.trim())
      .find(x => x.length >= 90 && x.length <= 350 && x.split(/\s+/).length >= 15
        && !/^(?:module|chapter|contents|table of contents|learning outcomes?)\b/i.test(x)
        && !/\.{4,}/.test(x));
    if (!excerpt || seen.has(excerpt.toLowerCase())) continue;
    seen.add(excerpt.toLowerCase());
    result.push({
      question: `Explain the following point from "${lesson.title}" in your own words, using an example from the lesson.`,
      suggestedAnswer: excerpt,
      sourceId: source.sourceId,
      page: source.page,
      requiresReview: true,
    });
  }
  return result;
}
