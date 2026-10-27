import type { DraftCourse } from "./course-factory";

export type QuizSuggestion = {
  question: string;
  suggestedAnswer: string;
  sourceId: string;
  page: number;
  requiresReview: true;
};

/**
 * Extractive quiz prompts only. No fabricated distractors, invented facts or
 * automatically scored answers. Trainers must write and verify answer options.
 */
export function suggestReviewQuestions(draft: DraftCourse, limit = 20): QuizSuggestion[] {
  if (!Number.isInteger(limit) || limit < 1 || limit > 100) throw new Error("Limit must be 1–100.");
  const result: QuizSuggestion[] = [];
  for (const lesson of draft.lessons) {
    if (result.length >= limit) break;
    const excerpt = lesson.body.split(/[.!?]\s+|\n+/).map((s) => s.trim())
      .find((s) => s.length >= 45 && s.length <= 350);
    const source = lesson.sourceRefs[0];
    if (!excerpt || !source) continue;
    result.push({
      question: `What is one important point explained in "${lesson.title}"?`,
      suggestedAnswer: excerpt,
      sourceId: source.sourceId,
      page: source.page,
      requiresReview: true,
    });
  }
  return result;
}
