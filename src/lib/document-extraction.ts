/** Browser-side extraction for supported text-based training documents.
 * Files are processed locally; this function does not upload source documents.
 */
import type { SourcePage } from "./course-factory";
import { createDocumentOcr, MAX_OCR_PAGES, ocrViewport } from "./document-ocr";

export const MAX_DOCUMENT_BYTES = 12 * 1024 * 1024;

export type ExtractionOptions = {
  ocr?: boolean;
  signal?: AbortSignal;
  onProgress?: (page: number, total: number, recognizing: boolean) => void;
  onRecognized?: (page: number, confidence: number) => void;
  onLowTextPage?: (page: number) => void;
};

export async function extractDocument(
  file: File,
  options: ExtractionOptions = {},
): Promise<SourcePage[]> {
  options.signal?.throwIfAborted();
  if (file.size > MAX_DOCUMENT_BYTES) throw new Error("Document exceeds 12 MB.");
  const ext = file.name.split(".").pop()?.toLowerCase();
  if (ext === "txt" || ext === "md") {
    return [{ sourceId: file.name, page: 1, text: await file.text() }];
  }
  if (ext === "docx") {
    const mammoth = await import("mammoth/mammoth.browser");
    const result = await mammoth.extractRawText({ arrayBuffer: await file.arrayBuffer() });
    if (!result.value.trim()) throw new Error("No readable Word text found.");
    return [{ sourceId: file.name, page: 1, text: result.value }];
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
          let content = text.items
            .reduce<{ lines: string[]; lastY: number | null }>(
              (acc, item) => {
                if (!("str" in item) || !item.str.trim()) return acc;
                const y =
                  "transform" in item && Array.isArray(item.transform)
                    ? Number(item.transform[5])
                    : null;
                if (y !== null && acc.lastY !== null && Math.abs(y - acc.lastY) > 3)
                  acc.lines.push("\n");
                else if (acc.lines.length) acc.lines.push(" ");
                acc.lines.push(item.str);
                acc.lastY = y;
                return acc;
              },
              { lines: [], lastY: null },
            )
            .lines.join("");
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
      return pages;
    } finally {
      signal.removeEventListener("abort", abortLoading);
      ocr?.close();
      await task.destroy().catch(() => {});
    }
  }
  if (ext === "pptx") {
    const JSZip = (await import("jszip")).default;
    const zip = await JSZip.loadAsync(await file.arrayBuffer());
    const slides = Object.keys(zip.files)
      .filter((name) => /^ppt\/slides\/slide\d+\.xml$/.test(name))
      .sort((a, b) => Number(a.match(/slide(\d+)/)?.[1]) - Number(b.match(/slide(\d+)/)?.[1]));
    if (slides.length > 500) throw new Error("Presentation exceeds 500 slides.");
    const pages: SourcePage[] = [];
    for (const [index, name] of slides.entries()) {
      const xml = await zip.files[name]!.async("text");
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
    return pages;
  }
  throw new Error("Supported formats: PDF, DOCX, PPTX, TXT and MD.");
}
