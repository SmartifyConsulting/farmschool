export type ContentFileType = "video" | "pdf" | "text" | "scorm";

const EXTENSION_TYPES: Record<string, ContentFileType> = {
  mp4: "video",
  mov: "video",
  m4v: "video",
  webm: "video",
  pdf: "pdf",
  txt: "text",
  md: "text",
  zip: "scorm",
};

export function detectContentFileType(fileName: string): ContentFileType | null {
  const ext = fileName.split(".").pop()?.toLowerCase() ?? "";
  return EXTENSION_TYPES[ext] ?? null;
}

export const CONTENT_TYPE_LABELS: Record<ContentFileType, string> = {
  video: "MP4 video",
  pdf: "PDF",
  text: "Text",
  scorm: "SCORM package",
};

const STOPWORDS = new Set([
  "the",
  "and",
  "for",
  "with",
  "module",
  "lesson",
  "course",
  "part",
  "of",
  "a",
  "an",
  "to",
  "in",
  "on",
]);

function keywords(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .replace(/[_\-.]/g, " ")
      .split(/\s+/)
      .filter((word) => word.length > 2 && !STOPWORDS.has(word)),
  );
}

/** Groups an uploaded file under the module whose title shares the most keywords with the file name; null if nothing matches. */
export function inferModuleId(
  fileName: string,
  modules: { id: string; title: string }[],
): string | null {
  const fileWords = keywords(fileName);
  if (fileWords.size === 0 || modules.length === 0) return null;
  let bestId: string | null = null;
  let bestScore = 0;
  for (const mod of modules) {
    const moduleWords = keywords(mod.title);
    let score = 0;
    for (const word of moduleWords) if (fileWords.has(word)) score++;
    if (score > bestScore) {
      bestScore = score;
      bestId = mod.id;
    }
  }
  return bestScore > 0 ? bestId : null;
}
