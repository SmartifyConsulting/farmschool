import { beforeEach, afterEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  load: vi.fn(),
  createOcr: vi.fn(),
  recognize: vi.fn(),
  close: vi.fn(),
}));
vi.mock("pdfjs-dist", () => ({ GlobalWorkerOptions: {}, getDocument: mocks.load }));
vi.mock("pdfjs-dist/build/pdf.worker.min.mjs?url", () => ({ default: "/pdf-worker.mjs" }));
vi.mock("./document-ocr", () => ({
  MAX_OCR_PAGES: 20,
  ocrViewport: () => ({ scale: 2, width: 1200, height: 1600 }),
  createDocumentOcr: mocks.createOcr,
}));
import { extractDocument } from "./document-extraction";

function setup(texts: string[]) {
  const pages = texts.map((text) => ({
    getTextContent: vi.fn(async () => ({
      items: text ? [{ str: text, transform: [1, 0, 0, 1, 0, 100] }] : [],
    })),
    getViewport: vi.fn(() => ({ width: 600, height: 800 })),
    render: vi.fn(() => ({ promise: Promise.resolve() })),
    cleanup: vi.fn(),
  }));
  const destroy = vi.fn(async () => {});
  const getPage = vi.fn(async (page: number) => pages[page - 1]!);
  mocks.load.mockReturnValue({
    promise: Promise.resolve({ numPages: pages.length, getPage }),
    destroy,
  });
  return { pages, destroy, getPage };
}
const file = () => new File(["PDF test fixture"], "training.pdf", { type: "application/pdf" });
beforeEach(() => {
  vi.resetAllMocks();
  vi.stubGlobal("document", { createElement: vi.fn(() => ({ width: 0, height: 0 })) });
  mocks.createOcr.mockResolvedValue({ recognize: mocks.recognize, close: mocks.close });
  mocks.recognize.mockResolvedValue({ text: "Recovered scanned training text", confidence: 64 });
});
afterEach(() => vi.unstubAllGlobals());
it("keeps native text and original page identities while recognizing sparse pages", async () => {
  const state = setup(["Original native document text is preserved.", ""]);
  const recognized = vi.fn();
  const pages = await extractDocument(file(), { ocr: true, onRecognized: recognized });
  expect(pages.map((page) => [page.page, page.text])).toEqual([
    [1, "Original native document text is preserved."],
    [2, "Recovered scanned training text"],
  ]);
  expect(mocks.recognize).toHaveBeenCalledTimes(1);
  expect(recognized).toHaveBeenCalledWith(2, 64);
  expect(state.pages[0]!.render).not.toHaveBeenCalled();
  expect(state.destroy).toHaveBeenCalled();
  expect(mocks.close).toHaveBeenCalled();
});
it("requires opt-in for scanned documents and releases the PDF", async () => {
  const state = setup([""]);
  await expect(extractDocument(file())).rejects.toThrow("Enable local");
  expect(mocks.createOcr).not.toHaveBeenCalled();
  expect(state.destroy).toHaveBeenCalled();
});
it("fails rather than returning a truncated document after the scanned-page cap", async () => {
  const state = setup(Array.from({ length: 21 }, () => ""));
  await expect(extractDocument(file(), { ocr: true })).rejects.toThrow("up to 20");
  expect(mocks.recognize).toHaveBeenCalledTimes(20);
  expect(mocks.close).toHaveBeenCalled();
  expect(state.pages[20]!.cleanup).toHaveBeenCalled();
  expect(state.destroy).toHaveBeenCalled();
});
it("cancels before another page is read and frees page resources", async () => {
  const state = setup(["First native page has enough embedded text.", "Second page"]);
  const controller = new AbortController();
  await expect(
    extractDocument(file(), { signal: controller.signal, onProgress: () => controller.abort() }),
  ).rejects.toThrow();
  expect(state.getPage.mock.calls.length).toBeLessThanOrEqual(1);
  expect(state.destroy).toHaveBeenCalled();
});
it("cleans up oversized PDFs before reading pages", async () => {
  const state = setup(Array.from({ length: 501 }, () => ""));
  await expect(extractDocument(file())).rejects.toThrow("500 pages");
  expect(state.getPage).not.toHaveBeenCalled();
  expect(state.destroy).toHaveBeenCalled();
});
