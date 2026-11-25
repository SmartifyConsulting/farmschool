export const MAX_SOURCE_CHARACTERS = 1_000_000;
export const MAX_SECTION_CHARACTERS = 100_000;
export const MAX_LESSON_CHARACTERS = 100_000;
export const MAX_PRODUCTION_SECTIONS = 20;

/** Keep every character, preferring paragraph boundaries over mid-sentence cuts. */
export function splitProductionSource(text: string): string[] {
  if (text.length > MAX_SOURCE_CHARACTERS)
    throw new Error(
      "These sources are too large for one lesson. Choose up to 1,000,000 characters at a time.",
    );
  const sections: string[] = [];
  let start = 0;
  while (start < text.length) {
    let end = Math.min(start + MAX_SECTION_CHARACTERS, text.length);
    if (end < text.length) {
      const minimum = start + Math.floor(MAX_SECTION_CHARACTERS * 0.6);
      const paragraph = text.lastIndexOf("\n\n", end - 2);
      const line = text.lastIndexOf("\n", end - 1);
      const space = text.lastIndexOf(" ", end - 1);
      const boundary =
        paragraph >= minimum
          ? paragraph + 2
          : line >= minimum
            ? line + 1
            : space >= minimum
              ? space + 1
              : end;
      end = boundary;
      // Do not cut a UTF-16 surrogate pair in half.
      if (
        /^[\uDC00-\uDFFF]$/.test(text[end] ?? "") &&
        /^[\uD800-\uDBFF]$/.test(text[end - 1] ?? "")
      )
        end--;
    }
    sections.push(text.slice(start, end));
    start = end;
  }
  if (sections.length > MAX_PRODUCTION_SECTIONS)
    throw new Error("Choose fewer sources for this lesson.");
  return sections;
}

export function productionSectionBudget(total: number) {
  if (!Number.isInteger(total) || total < 1 || total > MAX_PRODUCTION_SECTIONS)
    throw new Error("Invalid section count.");
  return Math.min(40_000, Math.floor((MAX_LESSON_CHARACTERS - 2 * (total - 1)) / total));
}

/** Completed results stay in the caller's cache if a later request fails. */
export async function produceSections({
  sections,
  results,
  generate,
  onProgress,
  stopped,
}: {
  sections: string[];
  results: string[];
  generate: (source: string, index: number, total: number) => Promise<string>;
  onProgress: (completed: number, body: string) => void;
  stopped: () => boolean;
}) {
  const budget = productionSectionBudget(sections.length);
  for (let index = results.length; index < sections.length; index++) {
    if (stopped()) return false;
    const body = await generate(sections[index]!, index, sections.length);
    if (!body.trim() || body.length > budget)
      throw new Error("This section could not be completed. Retry to continue from here.");
    results.push(body);
    onProgress(results.length, results.join("\n\n"));
  }
  return true;
}
