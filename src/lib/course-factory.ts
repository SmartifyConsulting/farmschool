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
const heading = /^(?:(?:module|chapter|unit|lesson|section|part|topic)\s+(?:\d+|[IVX]+|[A-Z])(?:[.:\s–-]+.*)?|\d+(?:\.\d+){0,2}[.)]?\s+[A-Z].{3,100})$/i;
const frontMatter = /^(?:table of contents|contents|copyright|acknowledg(?:e)?ments|foreword|preface|about (?:this|the) (?:manual|course)|learning objectives?|course overview)$/i;
const moduleHeading = /^(?:module|chapter|unit|lesson|section|part|topic)\\s+(?:\\d+|[IVX]+|[A-Z])(?:[.\\s:–-]+.*)?$/i;
const contentsEntry = /(?:\\.{3,}|…{2,}|\\s{3,})\\s*\\d{1,3}\\s*$/;
const coverMarker = /^(?:short learning programme|training manual|entrepreneurship|equip\\s*[•·-]\\s*learn|building skills,? empowering people|protecting pollinators|future leaders)$/i;
function looksLikeContents(lines: string[]): boolean {
  const moduleCount = lines.filter(line => moduleHeading.test(line) || contentsEntry.test(line)).length;
  return lines.some(line => /^(?:table of contents|contents)$/i.test(line))
    || (moduleCount >= 4 && lines.length < 65);
}
function normalise(text: string): string {
  return text.replace(/\r\n?/g, "\n").replace(/[\t ]+/g, " ").replace(/\n{3,}/g, "\n\n").trim();
}

/** Group content by actual headings across page boundaries; never use page numbers as lesson topics. */
export function buildCourseDraft(title: string, pages: SourcePage[]): DraftCourse {
  if (!title.trim() || title.length > 120) throw new Error("Course title must be 1–120 characters.");
  if (!pages.length || pages.length > MAX_PAGES) throw new Error("Supply 1–500 source pages.");
  if (pages.reduce((sum, p) => sum + p.text.length, 0) > MAX_CHARS) throw new Error("Source exceeds the 1,000,000 character limit.");
  const lessons: DraftLesson[] = [];
  const warnings: string[] = [];
  let currentTitle = title.trim();
  let foundHeading = false;
  let skippedIntro = 0;
  let body: string[] = [];
  let refs: { sourceId: string; page: number }[] = [];
  const flush = () => {
    const content = body.join("\n\n").trim();
    if (content.length > 0 && (foundHeading || content.length >= 250)) lessons.push({ title: currentTitle.slice(0, 120), body: content, sourceRefs: [...refs], reviewRequired: true });

    body = []; refs = [];
  };
  for (const page of pages) {
    if (!page.sourceId.trim() || !Number.isSafeInteger(page.page) || page.page < 1) throw new Error("Every page requires a source ID and positive page number.");
    const text = normalise(page.text);
    if (!text) { warnings.push(`Empty text on ${page.sourceId}, page ${page.page}; check whether OCR is required.`); continue; }
    const lines = text.split("\n").map((line) => line.trim()).filter(Boolean);
    if (!foundHeading && looksLikeContents(lines)) { skippedIntro++; continue; }
    for (const line of lines) {
      if (heading.test(line) && !frontMatter.test(line)) {
        if (!foundHeading && !moduleHeading.test(line) && body.length === 0) continue;
        flush(); currentTitle = line; foundHeading = true; continue;
      }
      if (!foundHeading && (frontMatter.test(line) || coverMarker.test(line) || contentsEntry.test(line) || line.length < 30)) { skippedIntro++; continue; }
      if (frontMatter.test(line) && body.length === 0) continue;
      body.push(line);
      if (!refs.some((r) => r.sourceId === page.sourceId && r.page === page.page)) refs.push({ sourceId: page.sourceId, page: page.page });
      if (body.join("\n\n").length > 16000) { flush(); currentTitle = `${currentTitle.slice(0, 95)} (continued)`; }
    }
  }
  flush();
  if (skippedIntro) warnings.push("Introductory, cover or contents material was skipped; check the proposed lesson boundaries against the source.");
  if (!lessons.length) warnings.push("No substantial readable content was found. Check source extraction before publishing.");
  if (lessons.length === 1 && pages.length > 3) warnings.push("Only one topic was detected; review headings and document structure before generating AI lessons.");
  return { title: title.trim(), lessons, status: "draft", warnings };
}

/** Drafts are intentionally never auto-published; a human must approve factual accuracy. */
export function canAutoPublish(_draft: DraftCourse): false { return false; }
