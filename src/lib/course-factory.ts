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
  /** Heading 1 the lesson belongs to; becomes a Studio module on import. */
  module?: string;
};
export type DraftCourse = {
  title: string;
  lessons: DraftLesson[];
  status: "draft";
  warnings: string[];
};

const MAX_PAGES = 500;
const MAX_CHARS = 1_000_000;
const heading = /^(?:(?:module|chapter|unit|lesson|section|part|topic)\s+(?:\d+|[IVX]+|[A-Z])(?:[.:\s–-]+.*)?|\d+(?:\.\d+)*[.)]?\s+[A-Z][^.!?]{2,100}|[IVX]+[.)]\s+[A-Z][^.!?]{2,100})$/i;
const contentsEntry = /(?:\.{2,}|…+|\s{3,})\s*\d{1,3}\s*$/;
const coverMarker = /^(?:short learning programme|training manual|copyright|all rights reserved|entrepreneurship|equip\s*[•·-]\s*learn|building skills,? empowering people|protecting pollinators|future leaders)$/i;
function normalise(text: string): string {
  return text.replace(/\r\n?/g, "\n").replace(/[\t ]+/g, " ").replace(/\n{3,}/g, "\n\n").trim();
}
const h1 = /^(?:(?:module|chapter|unit|part)\s+(?:\d+|[IVX]+|[A-Z])(?:[.:\s–-]+.*)?|\d+[.)]?\s+[A-Z][^.!?]{2,100}|[IVX]+[.)]\s+[A-Z][^.!?]{2,100})$/i;
const referencesHeading = /^(?:\d+(?:\.\d+)*[.)]?\s+)?(?:references?(?: list)?|bibliography|works cited|sources|further reading)$/i;
const listItem = /^(?:[•●▪◦·*-]|\(?\d+[.)]|\(?[a-z][.)])\s+/;

/** Rejoin lines that a PDF wrapped mid-sentence into flowing paragraphs. Keeps list items and real breaks. */
export function reflowText(text: string): string {
  const out: string[] = [];
  for (const block of text.replace(/\r\n?/g, "\n").split(/\n/)) {
    const line = block.replace(/[\t ]+/g, " ").trim();
    if (!line) { if (out.length && out.at(-1) !== "") out.push(""); continue; }
    const prev = out.at(-1);
    const joins = prev && prev !== "" && !listItem.test(line) && !/[.!?:;]["')\]]?$/.test(prev)
      && (/^[a-z(,;–-]/.test(line) || !/[.!?]$/.test(prev) && prev.length > 40);
    if (joins) out[out.length - 1] = prev.endsWith("-") && /^[a-z]/.test(line) ? prev.slice(0, -1) + line : `${prev} ${line}`;
    else { if (prev && prev !== "" && (listItem.test(line) ? !listItem.test(prev) : true)) out.push(""); out.push(line); }
  }
  return out.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

function contentsTitle(line: string): string {
  return line.replace(/(?:\.{2,}|…+|\s+)\s*\d{1,3}\s*$/, "").trim();
}
function titleCase(line: string): boolean {
  const words = line.split(/\s+/);
  return line.length < 100 && words.length >= 2 && words.length <= 12 && !/[.!?;]$/.test(line)
    && words.filter(word => /^[A-Z]/.test(word)).length >= Math.ceil(words.length * 0.7);
}

/** Preserve content after front matter, including text before the first recognised heading. */
export function buildCourseDraft(title: string, pages: SourcePage[], firstContentPage?: number): DraftCourse {
  if (!title.trim() || title.length > 120) throw new Error("Course title must be 1–120 characters.");
  if (!pages.length || pages.length > MAX_PAGES) throw new Error("Supply 1–500 source pages.");
  if (pages.reduce((sum, p) => sum + p.text.length, 0) > MAX_CHARS) throw new Error("Source exceeds the 1,000,000 character limit.");
  if (firstContentPage !== undefined && (!Number.isSafeInteger(firstContentPage) || firstContentPage < 1)) throw new Error("Choose a positive first content page.");
  const lessons: DraftLesson[] = [];
  const warnings: string[] = [];
  const tocTitles = new Set<string>();
  let currentTitle = title.trim();
  let currentModule: string | undefined;
  let inReferences = false;
  let started = false;
  let skipped = false;
  let body: string[] = [];
  let refs: DraftLesson["sourceRefs"] = [];
  const flush = () => {
    const content = reflowText(body.join("\n"));
    if (content) lessons.push({ title: currentTitle.slice(0, 120), body: content, sourceRefs: [...refs], reviewRequired: true, ...(currentModule ? { module: currentModule } : {}) });
    body = []; refs = [];
  };
  for (const [pageIndex, page] of pages.entries()) {
    if (!page.sourceId.trim() || !Number.isSafeInteger(page.page) || page.page < 1) throw new Error("Every page requires a source ID and positive page number.");
    const lines = normalise(page.text).split("\n").map(line => line.trim()).filter(Boolean);
    if (!page.text.trim()) { warnings.push(`Empty text on ${page.sourceId}, page ${page.page}; check whether OCR is required.`); continue; }
    const isContents = lines.some(line => /^(?:table of contents|contents)$/i.test(line)) || (lines.filter(line => contentsEntry.test(line)).length >= 3 && lines.length < 65);
    if (!started && isContents) {
      for (const line of lines) if (!/^(?:table of contents|contents)$/i.test(line)) tocTitles.add(contentsTitle(line).toLowerCase());
      skipped = true; continue;
    }
    if (firstContentPage !== undefined && page.page < firstContentPage) { skipped = true; continue; }
    if (firstContentPage === undefined && !started && pageIndex === 0 && page.page === 1 && pages.length > 1
      && !lines.some(line => heading.test(line)) && (lines.some(line => coverMarker.test(line)) || (lines.length < 12 && page.text.length < 250 && !/[.!?]/.test(page.text)))) { skipped = true; continue; }
    for (const [lineIndex, line] of lines.entries()) {
      if (/^\d+$/.test(line)) continue;
      if (referencesHeading.test(line)) { flush(); inReferences = true; skipped = true; continue; }
      if (inReferences) { if (h1.test(line)) inReferences = false; else continue; }
      const isHeading = heading.test(line) || tocTitles.has(line.toLowerCase()) || (lineIndex === 0 && titleCase(line));
      if (isHeading) {
        if (started && !body.length && /^(?:module|chapter|unit)\s+\d+$/i.test(currentTitle)) {
          currentTitle = `${currentTitle}: ${line}`.slice(0, 120);
          if (currentModule && /^(?:module|chapter|unit)\s+\d+$/i.test(currentModule)) currentModule = currentTitle;
        } else if (line !== currentTitle || !started) {
          flush();
          if (h1.test(line)) { currentModule = line.slice(0, 120); currentTitle = line; }
          else currentTitle = line;
        }
        started = true;
        continue;
      }
      started = true;
      // Split before a paragraph, never in the middle of its text.
      if (body.length && body.join("\n\n").length + line.length > 16000) {
        flush();
        const sentence = line.split(/(?<=[.!?])\s+/)[0] ?? line;
        currentTitle = sentence.length <= 100 ? sentence.replace(/[.!?]$/, "") : `${title.trim()} · Topic ${lessons.length + 1}`;
      }
      body.push(line);
      if (!refs.some(ref => ref.sourceId === page.sourceId && ref.page === page.page)) refs.push({ sourceId: page.sourceId, page: page.page });
    }
  }
  flush();
  for (const lesson of lessons) if (lesson.module && lesson.title === lesson.module && lessons.some(other => other !== lesson && other.module === lesson.module)) lesson.title = `${lesson.title} · Overview`.slice(0, 120);
  if (skipped) warnings.push("Cover, contents and reference list material excluded. Check the source page ranges below.");
  if (!lessons.length) warnings.push("No substantial readable content was found. Check source extraction before publishing.");
  if (lessons.length === 1 && pages.length > 3) warnings.push("One topic detected. Check its boundaries before generating lessons.");
  return { title: title.trim(), lessons, status: "draft", warnings };
}

/** Editing boundaries never changes source text or automatically approves a lesson. */
export function splitDraftLesson(lesson: DraftLesson, offset: number): DraftLesson[] {
  if (offset <= 0 || offset >= lesson.body.length) return [lesson];
  const first = lesson.body.slice(0, offset).trim();
  const second = lesson.body.slice(offset).trim();
  if (!first || !second) return [lesson];
  return [{ ...lesson, body: first }, { ...lesson, title: `${lesson.title.slice(0, 105)} — part 2`, body: second }];
}
/** Split before paragraph `index` (paragraphs separated by blank lines), giving the new lesson its own title. */
export function splitDraftLessonAt(lesson: DraftLesson, index: number, newTitle?: string): DraftLesson[] {
  const paragraphs = lesson.body.split(/\n{2,}/);
  if (index <= 0 || index >= paragraphs.length) return [lesson];
  const second = { ...lesson, title: (newTitle?.trim() || `${lesson.title.slice(0, 105)} — part 2`).slice(0, 120), body: paragraphs.slice(index).join("\n\n") };
  return [{ ...lesson, body: paragraphs.slice(0, index).join("\n\n") }, second];
}
export function mergeDraftLessons(first: DraftLesson, second: DraftLesson): DraftLesson {
  const sourceRefs = [...first.sourceRefs];
  for (const ref of second.sourceRefs) if (!sourceRefs.some(existing => existing.sourceId === ref.sourceId && existing.page === ref.page)) sourceRefs.push(ref);
  return { ...first, body: `${first.body}\n\n${second.body}`, sourceRefs, reviewRequired: true };
}

/** Drafts are intentionally never auto-published; a human must approve factual accuracy. */
export function canAutoPublish(_draft: DraftCourse): false { return false; }
