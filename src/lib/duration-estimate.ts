const WORDS_PER_MINUTE = 200;
/** Fixed time added per knowledge-check question — reading the question, considering options, answering. */
const MINUTES_PER_QUESTION = 0.5;

/** Rough reading-time estimate for a lesson: body word count at a typical reading pace, plus a
 * fixed allowance per knowledge-check question. Not a measured figure — a planning estimate only. */
export function estimateMinutes(text: string, questionCount = 0): number {
  const words = text.trim().split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.ceil(words / WORDS_PER_MINUTE + questionCount * MINUTES_PER_QUESTION));
}

export function formatMinutes(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m ? `${h} h ${m} min` : `${h} h`;
}
