/**
 * Course Factory: deterministic, source-grounded draft builder.
 * This module does not call AI or publish courses. It turns verified extracted
 * text into reviewable lesson and quiz suggestions with source provenance.
 */
export type SourcePage = { sourceId: string; page: number; text: string };
export type DraftLesson = {
  title: string;
  body: string;
  sourceRefs: { sourceId: string; page: number }[];
  reviewRequired: true;
};
export type DraftCourse = {
  title: string;
  lessons: DraftLesson[];
  status: "draft";
  warnings: string[];
};

const MAX_PAGES = 500;
const MAX_CHARS = 1_000_000;
const heading = /^(?:module|chapter|unit|lesson|section)\s+\d+(?:[.:\s–-]+.*)?$/i;

function normalise(text: string): string {
  return text.replace(/\r\n?/g, "\n").replace(/[\t ]+/g, " ").trim();
}

/** Never invents lesson content: every paragraph is copied from a source page. */
export function buildCourseDraft(title: string, pages: SourcePage[]): DraftCourse {
  if (!title.trim() || title.length > 120) throw new Error("Course title must be 1–120 characters.");
  if (!pages.length || pages.length > MAX_PAGES) throw new Error("Supply 1–500 source pages.");
  if (pages.reduce((sum, p) => sum + p.text.length, 0) > MAX_CHARS) throw new Error("Source exceeds the 1,000,000 character limit.");
  const lessons: DraftLesson[] = [];
  const warnings: string[] = [];
  for (const page of pages) {
    if (!page.sourceId.trim() || !Number.isSafeInteger(page.page) || page.page < 1) throw new Error("Every page requires a source ID and positive page number.");
    const text = normalise(page.text);
    if (!text) { warnings.push(`Empty text on ${page.sourceId}, page ${page.page}; check whether OCR is required.`); continue; }
    const lines = text.split("\n").map((line) => line.trim()).filter(Boolean);
    let currentTitle = `Source page ${page.page}`;
    let body: string[] = [];
    const flush = () => {
      if (!body.length) return;
      lessons.push({
        title: currentTitle.slice(0, 120),
        body: body.join("\n\n"),
        sourceRefs: [{ sourceId: page.sourceId, page: page.page }],
        reviewRequired: true,
      });
      body = [];
    };
    for (const line of lines) {
      if (heading.test(line)) { flush(); currentTitle = line; }
      else body.push(line);
    }
    flush();
  }
  if (!lessons.length) warnings.push("No readable content was found. Do not publish until source extraction is checked.");
  return { title: title.trim(), lessons, status: "draft", warnings };
}

/** Drafts are intentionally never auto-published; a human must approve factual accuracy. */
export function canAutoPublish(_draft: DraftCourse): false { return false; }
