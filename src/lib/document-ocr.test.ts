import { afterEach, beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ createWorker: vi.fn(), recognize: vi.fn(), terminate: vi.fn() }));
vi.mock("tesseract.js", () => ({ createWorker: mocks.createWorker }));
import { createDocumentOcr, MAX_OCR_PIXELS, ocrViewport } from "./document-ocr";
beforeEach(() => {
  vi.resetAllMocks();
  vi.stubGlobal("window", { location: { origin: "https://training.example" } });
  mocks.terminate.mockResolvedValue(undefined);
  mocks.createWorker.mockResolvedValue({ recognize: mocks.recognize, terminate: mocks.terminate });
  mocks.recognize.mockResolvedValue({ data: { text: " Recognized training ", confidence: 87 } });
});
afterEach(() => vi.unstubAllGlobals());

it("bounds scan rendering memory without stretching the page", () => {
  const normal = ocrViewport(600, 800);
  expect(normal).toEqual({ scale: 2, width: 1200, height: 1600 });
  const large = ocrViewport(4000, 6000);
  expect(large.width * large.height).toBeLessThanOrEqual(MAX_OCR_PIXELS);
  expect(large.width / large.height).toBeCloseTo(2 / 3, 2);
});
it("rejects malformed page dimensions before allocating a canvas", () => {
  for (const [width, height] of [
    [0, 100],
    [-1, 20],
    [Infinity, 20],
    [20, NaN],
  ])
    expect(() => ocrViewport(width!, height!)).toThrow();
});
it("uses only local assets and bounds document workers to one", async () => {
  const engine = await createDocumentOcr(new AbortController().signal);
  try {
    await expect(createDocumentOcr(new AbortController().signal)).rejects.toThrow(
      "Another document",
    );
    expect(mocks.createWorker).toHaveBeenCalledWith(
      "eng",
      1,
      expect.objectContaining({
        workerPath: "https://training.example/ocr/v7-eng1/worker.min.js",
        corePath: "https://training.example/ocr/v7-eng1/",
        langPath: "https://training.example/ocr/v7-eng1/",
        workerBlobURL: false,
        cacheMethod: "none",
      }),
    );
    await expect(engine.recognize({} as HTMLCanvasElement)).resolves.toEqual({
      text: "Recognized training",
      confidence: 87,
    });
  } finally {
    engine.close();
    await vi.waitFor(() => expect(mocks.terminate).toHaveBeenCalledOnce());
  }
});
it("cancels an in-flight recognition without accepting a late result", async () => {
  const controller = new AbortController();
  const engine = await createDocumentOcr(controller.signal);
  mocks.recognize.mockReturnValue(new Promise(() => {}));
  const result = engine.recognize({} as HTMLCanvasElement);
  controller.abort();
  await expect(result).rejects.toThrow("cancelled");
  engine.close();
  await vi.waitFor(() => expect(mocks.terminate).toHaveBeenCalledOnce());
});
