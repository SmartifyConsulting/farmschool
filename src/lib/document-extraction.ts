/** Browser-side extraction for supported text-based training documents.
 * Files are processed locally; this function does not upload source documents.
 */
import type { SourcePage } from "./course-factory";

export const MAX_DOCUMENT_BYTES = 12 * 1024 * 1024;

export async function extractDocument(file: File): Promise<SourcePage[]> {
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
    pdfjs.GlobalWorkerOptions.workerSrc = (await import("pdfjs-dist/build/pdf.worker.min.mjs?url")).default;
    const pdf = await pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()), useSystemFonts: true, disableFontFace: true }).promise;
    if (pdf.numPages > 500) throw new Error("PDF exceeds 500 pages.");
    const pages: SourcePage[] = [];
    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const text = await page.getTextContent();
      pages.push({ sourceId: file.name, page: i, text: text.items.map((item) => "str" in item ? item.str : "").join(" ") });
    }
    if (pages.every((page) => !page.text.trim())) throw new Error("This PDF appears scanned. OCR is not available yet.");
    return pages;
  }
  if (ext === "pptx") {
    const JSZip = (await import("jszip")).default;
    const zip = await JSZip.loadAsync(await file.arrayBuffer());
    const slides = Object.keys(zip.files).filter((name) => /^ppt\/slides\/slide\d+\.xml$/.test(name))
      .sort((a, b) => Number(a.match(/slide(\d+)/)?.[1]) - Number(b.match(/slide(\d+)/)?.[1]));
    if (slides.length > 500) throw new Error("Presentation exceeds 500 slides.");
    const pages: SourcePage[] = [];
    for (const [index, name] of slides.entries()) {
      const xml = await zip.files[name]!.async("text");
      const document = new DOMParser().parseFromString(xml, "application/xml");
      if (document.querySelector("parsererror")) throw new Error("Invalid PowerPoint slide XML.");
      const text = Array.from(document.getElementsByTagNameNS("http://schemas.openxmlformats.org/drawingml/2006/main", "t"))
        .map((node) => node.textContent ?? "").join("\n");
      pages.push({ sourceId: file.name, page: index + 1, text });
    }
    if (!pages.length || pages.every((page) => !page.text.trim())) throw new Error("No readable slide text found.");
    return pages;
  }
  throw new Error("Supported formats: PDF, DOCX, PPTX, TXT and MD.");
}
