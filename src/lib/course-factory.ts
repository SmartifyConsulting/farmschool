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
      body.push(line);
      if (!refs.some(ref => ref.sourceId === page.sourceId && ref.page === page.page)) refs.push({ sourceId: page.sourceId, page: page.page });
    }
  }
  flush();
  const balanced = balanceDraftLessons(lessons);
  for (const lesson of balanced) if (lesson.module && lesson.title === lesson.module && balanced.some(other => other !== lesson && other.module === lesson.module)) lesson.title = `${lesson.title} · Overview`.slice(0, 120);
  if (skipped) warnings.push("Cover, contents and reference list material excluded. Check the source page ranges below.");
  if (!balanced.length) warnings.push("No substantial readable content was found. Check source extraction before publishing.");
  if (balanced.length === 1 && pages.length > 3) warnings.push("One topic detected. Check its boundaries before generating lessons.");
  return { title: title.trim(), lessons: balanced, status: "draft", warnings };
}

// A sub-heading this short reads as "just a couple of lines" — not worth its own screen.
const MERGE_UNDER_CHARS = 220;
// A sub-heading with this much material needs to be broken into separate screens.
const SPLIT_OVER_CHARS = 2400;
const SPLIT_TARGET_CHARS = 1500;

/** Breaks an overlong lesson into paragraph-aligned parts, never mid-paragraph. */
function splitLongLesson(lesson: DraftLesson): DraftLesson[] {
  if (lesson.body.length <= SPLIT_OVER_CHARS) return [lesson];
  const paragraphs = lesson.body.split(/\n{2,}/).filter(Boolean);
  if (paragraphs.length < 2) return [lesson];
  const parts: string[][] = [[]];
  let size = 0;
  for (const para of paragraphs) {
    if (size > 0 && size + para.length > SPLIT_TARGET_CHARS) { parts.push([]); size = 0; }
    parts.at(-1)!.push(para);
    size += para.length;
  }
  if (parts.length < 2) return [lesson];
  return parts.map((paras, i) => ({
    ...lesson,
    title: `${lesson.title.slice(0, 100)} (${i + 1} of ${parts.length})`.slice(0, 120),
    body: paras.join("\n\n"),
  }));
}

/** Folds consecutive short sub-headings under the same module into one lesson, so a handful of sentences each don't become a handful of near-empty screens. The module's own overview lesson (title === module) is never folded in, so it stays a distinct landing screen. */
function mergeShortLessons(lessons: DraftLesson[]): DraftLesson[] {
  const merged: DraftLesson[] = [];
  for (const lesson of lessons) {
    const prev = merged.at(-1);
    const prevIsOverview = prev && prev.module !== undefined && prev.title === prev.module;
    const thisIsOverview = lesson.module !== undefined && lesson.title === lesson.module;
    const canMerge =
      prev &&
      !prevIsOverview &&
      !thisIsOverview &&
      prev.module !== undefined &&
      prev.module === lesson.module &&
      prev.body.length < MERGE_UNDER_CHARS &&
      prev.body.length + lesson.body.length <= SPLIT_OVER_CHARS;
    if (prev && canMerge) {
      merged[merged.length - 1] = {
        ...prev,
        title: `${prev.title} & ${lesson.title}`.slice(0, 120),
        body: `${prev.body}\n\n${lesson.body}`,
        sourceRefs: [
          ...prev.sourceRefs,
          ...lesson.sourceRefs.filter(
            ref => !prev.sourceRefs.some(existing => existing.sourceId === ref.sourceId && existing.page === ref.page),
          ),
        ],
      };
    } else {
      merged.push(lesson);
    }
  }
  return merged;
}

/**
 * Applies editorial discretion to a flat list of heading-bounded lessons: split any
 * sub-heading with a lot of material into several screens, and fold consecutive short
 * sub-headings under the same module into one screen. Order matters — splitting first
 * means a merge pass never has to reconsider an already-oversized lesson.
 */
export function balanceDraftLessons(lessons: DraftLesson[]): DraftLesson[] {
  return mergeShortLessons(lessons.flatMap(splitLongLesson));
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
