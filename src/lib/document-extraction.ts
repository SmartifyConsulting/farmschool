/** Browser-side extraction for supported text-based training documents.
 * Files are processed locally; this function does not upload source documents.
 */
import type { SourcePage } from "./course-factory";
import { createDocumentOcr, MAX_OCR_PAGES, ocrViewport } from "./document-ocr";
import { inspectOfficeDocument } from "./office-import";

export const MAX_DOCUMENT_BYTES = 12 * 1024 * 1024;

type PositionedItem = { x: number; y: number; width: number; str: string };

/**
 * Orders a PDF page's text items into reading order. pdf.js returns items in
 * content-stream order, which is usually correct for single-column text but
 * can interleave or misorder items within a line, and gives no help at all
 * for two-column layouts. This clusters items into rows by Y position, sorts
 * each row left-to-right, then — only when a clear, consistent vertical gutter
 * splits the page — reads the left column fully before the right column,
 * treating any row whose text crosses the gutter as a full-width row that
 * breaks the column flow (so a heading spanning both columns stays in place).
 */
export function orderPageTextForReading(items: unknown[], pageWidth: number): string {
  const positioned: PositionedItem[] = [];
  for (const item of items) {
    if (!item || typeof item !== "object" || !("str" in item)) continue;
    const str = (item as { str: unknown }).str;
    if (typeof str !== "string" || !str.trim()) continue;
    const transform = (item as { transform?: unknown }).transform;
    const width = (item as { width?: unknown }).width;
    if (!Array.isArray(transform)) continue;
    positioned.push({
      x: Number(transform[4]) || 0,
      y: Number(transform[5]) || 0,
      width: typeof width === "number" ? width : 0,
      str,
    });
  }
  if (!positioned.length) return "";

  // Cluster into rows by Y proximity (matches the prior single-column heuristic).
  const sorted = [...positioned].sort((a, b) => b.y - a.y);
  const rows: PositionedItem[][] = [];
  for (const item of sorted) {
    const row = rows.at(-1);
    if (row && Math.abs(item.y - row[0].y) <= 3) row.push(item);
    else rows.push([item]);
  }
  for (const row of rows) row.sort((a, b) => a.x - b.x);

  // Look for a vertical gutter: an X-range with no text, roughly in the
  // middle third of the page, empty across most multi-item rows.
  const multiItemRows = rows.filter((row) => row.length > 1);
  let gutterStart: number | null = null;
  let gutterEnd: number | null = null;
  if (multiItemRows.length >= 4) {
    const candidateMin = pageWidth * 0.35;
    const candidateMax = pageWidth * 0.65;
    const step = pageWidth * 0.01;
    for (let x = candidateMin; x < candidateMax; x += step) {
      const emptyHere = multiItemRows.filter(
        (row) => !row.some((item) => x >= item.x - 1 && x <= item.x + item.width + 1),
      ).length;
      if (emptyHere / multiItemRows.length >= 0.85) {
        gutterStart ??= x;
        gutterEnd = x + step;
      } else if (gutterStart !== null && gutterEnd !== null && gutterEnd - gutterStart >= pageWidth * 0.02) {
        break;
      } else {
        gutterStart = null;
        gutterEnd = null;
      }
    }
  }

  const rowText = (row: PositionedItem[]) => row.map((item) => item.str).join(" ");
  if (gutterStart === null || gutterEnd === null) {
    return rows.map(rowText).join("\n");
  }
  const gutter = (gutterStart + gutterEnd) / 2;

  const out: string[] = [];
  let left: string[] = [];
  let right: string[] = [];
  const flushColumns = () => {
    if (left.length) out.push(left.join("\n"));
    if (right.length) out.push(right.join("\n"));
    left = [];
    right = [];
  };
  for (const row of rows) {
    const crossesGutter = row.some((item) => item.x < gutter) && row.some((item) => item.x + item.width > gutter);
    if (crossesGutter) {
      flushColumns();
      out.push(rowText(row));
      continue;
    }
    const onRight = row[0].x >= gutter;
    (onRight ? right : left).push(rowText(row));
  }
  flushColumns();
  return out.join("\n");
}

export type ExtractionOptions = {
  ocr?: boolean;
  signal?: AbortSignal;
  onProgress?: (page: number, total: number, recognizing: boolean) => void;
  onRecognized?: (page: number, confidence: number) => void;
  onLowTextPage?: (page: number) => void;
};

/** Normalizes a header/footer candidate line so "Page 3 of 42" and "Page 4 of
 * 42" are recognized as the same running element despite the changing number. */
function normaliseRunningLine(line: string): string {
  return line
    .trim()
    .toLowerCase()
    .replace(/\d+/g, "#");
}

/**
 * Strips lines that repeat, in the same position (top or bottom of the
 * page), across most pages of a multi-page document — running headers,
 * footers, and page numbers. Only looks at the first/last couple of lines
 * per page, so it never touches body content that happens to repeat.
 */
export function stripRepeatedHeaderFooterLines(pages: SourcePage[]): SourcePage[] {
  if (pages.length < 3) return pages;
  const EDGE_LINES = 2;
  const headerCounts = new Map<string, number>();
  const footerCounts = new Map<string, number>();
  const perPage = pages.map((page) => {
    const lines = page.text.split(/\r\n?|\n/);
    const nonEmpty = lines.map((l, i) => [i, l] as const).filter(([, l]) => l.trim());
    const headerIdx = nonEmpty.slice(0, EDGE_LINES).map(([i]) => i);
    const footerIdx = nonEmpty.slice(-EDGE_LINES).map(([i]) => i);
    for (const i of headerIdx) {
      const key = normaliseRunningLine(lines[i]!);
      if (key) headerCounts.set(key, (headerCounts.get(key) ?? 0) + 1);
    }
    for (const i of footerIdx) {
      const key = normaliseRunningLine(lines[i]!);
      if (key) footerCounts.set(key, (footerCounts.get(key) ?? 0) + 1);
    }
    return { lines, headerIdx, footerIdx };
  });
  const threshold = Math.ceil(pages.length * 0.6);
  const isRunning = (key: string, counts: Map<string, number>) =>
    key.length > 0 && (counts.get(key) ?? 0) >= threshold;
  return pages.map((page, pageIndex) => {
    const { lines, headerIdx, footerIdx } = perPage[pageIndex]!;
    const drop = new Set<number>();
    for (const i of headerIdx) if (isRunning(normaliseRunningLine(lines[i]!), headerCounts)) drop.add(i);
    for (const i of footerIdx) if (isRunning(normaliseRunningLine(lines[i]!), footerCounts)) drop.add(i);
    if (!drop.size) return page;
    const text = lines.filter((_, i) => !drop.has(i)).join("\n");
    return { ...page, text };
  });
}

export async function extractDocument(
  file: File,
  options: ExtractionOptions = {},
): Promise<SourcePage[]> {
  options.signal?.throwIfAborted();
  if (file.size > MAX_DOCUMENT_BYTES) throw new Error("Document exceeds 12 MB.");
  const complete = (pages: SourcePage[]) => {
    options.signal?.throwIfAborted();
    if (pages.reduce((total, page) => total + page.text.length, 0) > 1_000_000)
      throw new Error(
        "Extracted document exceeds one million characters. Split it into smaller files.",
      );
    return pages;
  };
  const ext = file.name.split(".").pop()?.toLowerCase();
  if (ext === "txt" || ext === "md") {
    return complete([{ sourceId: file.name, page: 1, text: await file.text() }]);
  }
  if (ext === "docx") {
    const mammoth = await import("mammoth/mammoth.browser");
    const buffer = await file.arrayBuffer();
    await inspectOfficeDocument(buffer, () => false, options.signal);
    const result = await mammoth.extractRawText({ arrayBuffer: buffer });
    if (!result.value.trim()) throw new Error("No readable Word text found.");
    return complete([{ sourceId: file.name, page: 1, text: result.value }]);
  }
  if (ext === "pdf") {
    const pdfjs = await import("pdfjs-dist");
    pdfjs.GlobalWorkerOptions.workerSrc = (
      await import("pdfjs-dist/build/pdf.worker.min.mjs?url")
    ).default;
    const signal = options.signal ?? new AbortController().signal;
    signal.throwIfAborted();
    const task = pdfjs.getDocument({
      data: new Uint8Array(await file.arrayBuffer()),
      useSystemFonts: true,
      disableFontFace: true,
      enableXfa: false,
      maxImageSize: 16_000_000,
      canvasMaxAreaInBytes: 16_000_000,
    });
    const pages: SourcePage[] = [];
    let ocr: Awaited<ReturnType<typeof createDocumentOcr>> | undefined;
    let scanned = 0;
    let characters = 0;
    const abortLoading = () => {
      void task.destroy().catch(() => {});
    };
    signal.addEventListener("abort", abortLoading, { once: true });
    try {
      const pdf = await task.promise;
      signal.throwIfAborted();
      if (pdf.numPages > 500) throw new Error("PDF exceeds 500 pages.");
      for (let i = 1; i <= pdf.numPages; i++) {
        signal.throwIfAborted();
        options.onProgress?.(i, pdf.numPages, false);
        const page = await pdf.getPage(i);
        try {
          const text = await page.getTextContent();
          const viewport = page.getViewport({ scale: 1 });
          let content = orderPageTextForReading(text.items, viewport.width);
          if (content.trim().length < 24) options.onLowTextPage?.(i);
          if (options.ocr && content.trim().length < 24) {
            if (++scanned > MAX_OCR_PAGES)
              throw new Error(
                "Recognition supports up to 20 scanned pages per document. Split this PDF into smaller files.",
              );
            options.onProgress?.(i, pdf.numPages, true);
            ocr ??= await createDocumentOcr(signal);
            const original = page.getViewport({ scale: 1 });
            const dimensions = ocrViewport(original.width, original.height);
            const canvas = document.createElement("canvas");
            canvas.width = dimensions.width;
            canvas.height = dimensions.height;
            try {
              await page.render({
                canvas,
                viewport: page.getViewport({ scale: dimensions.scale }),
                background: "rgb(255,255,255)",
              }).promise;
              signal.throwIfAborted();
              const recognized = await ocr.recognize(canvas);
              if (recognized.text) content = recognized.text;
              options.onRecognized?.(i, recognized.confidence);
            } finally {
              canvas.width = 0;
              canvas.height = 0;
            }
          }
          characters += content.length;
          if (characters > 1_000_000)
            throw new Error(
              "Extracted document exceeds one million characters. Split it into smaller files.",
            );
          pages.push({ sourceId: file.name, page: i, text: content });
        } finally {
          page.cleanup();
        }
      }
      if (pages.every((page) => !page.text.trim()))
        throw new Error(
          options.ocr
            ? "No readable text was recognized. Try a clearer scan or paste the text manually."
            : "This PDF appears scanned. Enable local scanned-PDF recognition or paste the text manually.",
        );
      signal.throwIfAborted();
      return complete(stripRepeatedHeaderFooterLines(pages));
    } finally {
      signal.removeEventListener("abort", abortLoading);
      ocr?.close();
      await task.destroy().catch(() => {});
    }
  }
  if (ext === "pptx") {
    const content = await inspectOfficeDocument(
      await file.arrayBuffer(),
      (name) => /^ppt\/slides\/slide\d+\.xml$/.test(name),
      options.signal,
    );
    const slides = [...content.keys()]
      .filter((name) => /^ppt\/slides\/slide\d+\.xml$/.test(name))
      .sort((a, b) => Number(a.match(/slide(\d+)/)?.[1]) - Number(b.match(/slide(\d+)/)?.[1]));
    if (slides.length > 500) throw new Error("Presentation exceeds 500 slides.");
    const pages: SourcePage[] = [];
    for (const [index, name] of slides.entries()) {
      options.signal?.throwIfAborted();
      const xml = content.get(name)!;
      const document = new DOMParser().parseFromString(xml, "application/xml");
      if (document.querySelector("parsererror")) throw new Error("Invalid PowerPoint slide XML.");
      const text = Array.from(
        document.getElementsByTagNameNS(
          "http://schemas.openxmlformats.org/drawingml/2006/main",
          "t",
        ),
      )
        .map((node) => node.textContent ?? "")
        .join("\n");
      pages.push({ sourceId: file.name, page: index + 1, text });
    }
    if (!pages.length || pages.every((page) => !page.text.trim()))
      throw new Error("No readable slide text found.");
    return complete(pages);
  }
  throw new Error("Supported formats: PDF, DOCX, PPTX, TXT and MD.");
}
