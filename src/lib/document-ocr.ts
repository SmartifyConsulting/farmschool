import type { Worker } from "tesseract.js";

export const MAX_OCR_PAGES = 20;
export const MAX_OCR_PIXELS = 4_000_000;
let active = false;

export function ocrViewport(width: number, height: number) {
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0)
    throw new Error("Invalid document page dimensions.");
  const scale = Math.min(2, Math.sqrt(MAX_OCR_PIXELS / (width * height)));
  return {
    scale,
    width: Math.max(1, Math.floor(width * scale)),
    height: Math.max(1, Math.floor(height * scale)),
  };
}

export async function createDocumentOcr(signal: AbortSignal) {
  if (active)
    throw new Error(
      "Another document is being recognized. Wait for it to finish or reload this page.",
    );
  signal.throwIfAborted();
  active = true;
  let worker: Worker | undefined;
  let stopped = false;
  let pending: Promise<Worker> | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let rejectStopped: (reason: Error) => void = () => {};
  const interrupted = new Promise<never>((_, reject) => {
    rejectStopped = reject;
  });
  void interrupted.catch(() => {});
  const stop = (reason: Error) => {
    if (stopped) return;
    stopped = true;
    rejectStopped(reason);
    if (worker)
      void worker
        .terminate()
        .catch(() => {})
        .finally(() => {
          active = false;
        });
    else if (pending)
      void pending
        .then((w) => w.terminate())
        .catch(() => {})
        .finally(() => {
          active = false;
        });
    else active = false;
  };
  const abort = () => stop(new Error("Document recognition cancelled."));
  signal.addEventListener("abort", abort, { once: true });
  timer = setTimeout(
    () => stop(new Error("Document recognition took too long. Try a smaller document.")),
    180000,
  );
  const close = () => {
    signal.removeEventListener("abort", abort);
    clearTimeout(timer);
    stop(new Error("Document recognition finished."));
  };
  try {
    const { createWorker } = await import("tesseract.js");
    if (stopped) throw new Error("Document recognition cancelled.");
    const base = new URL("/ocr/v7-eng1/", window.location.origin).href;
    pending = createWorker("eng", 1, {
      workerPath: base + "worker.min.js",
      corePath: base,
      langPath: base,
      workerBlobURL: false,
      cacheMethod: "none",
    });
    worker = await Promise.race([pending, interrupted]);
    return {
      recognize: async (canvas: HTMLCanvasElement) => {
        if (stopped) throw new Error("Document recognition cancelled.");
        const result = await Promise.race([worker!.recognize(canvas), interrupted]);
        if (!Number.isFinite(result.data.confidence))
          throw new Error("Document recognition did not return a usable result.");
        return { text: result.data.text.trim(), confidence: result.data.confidence };
      },
      close,
    };
  } catch (error) {
    close();
    throw error;
  }
}
