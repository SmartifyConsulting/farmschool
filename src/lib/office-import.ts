import type JSZip from "jszip";

export const OFFICE_ENTRY_LIMIT = 2000;
export const OFFICE_XML_LIMIT = 8 * 1024 * 1024;
export const OFFICE_TOTAL_XML_LIMIT = 32 * 1024 * 1024;

export function inspectOfficeDirectory(buffer: ArrayBuffer) {
  const data = new DataView(buffer);
  let end = -1;
  for (
    let offset = buffer.byteLength - 22;
    offset >= Math.max(0, buffer.byteLength - 65557);
    offset--
  ) {
    if (
      data.getUint32(offset, true) === 0x06054b50 &&
      offset + 22 + data.getUint16(offset + 20, true) === buffer.byteLength
    ) {
      end = offset;
      break;
    }
  }
  if (end < 0) throw new Error("The Office document has an invalid compressed directory.");
  const count = data.getUint16(end + 10, true),
    size = data.getUint32(end + 12, true),
    start = data.getUint32(end + 16, true);
  if (
    data.getUint16(end + 4, true) !== 0 ||
    data.getUint16(end + 6, true) !== 0 ||
    data.getUint16(end + 8, true) !== count ||
    count === 65535 ||
    size === 0xffffffff ||
    start === 0xffffffff
  )
    throw new Error("Split or extended Office archives are not supported.");
  if (count > OFFICE_ENTRY_LIMIT)
    throw new Error("This document has too many embedded files. Split it into smaller files.");
  if (start + size > end)
    throw new Error("The Office document has an invalid compressed directory.");
  let offset = start,
    entries = 0;
  while (offset < start + size) {
    if (
      ++entries > OFFICE_ENTRY_LIMIT ||
      offset + 46 > start + size ||
      data.getUint32(offset, true) !== 0x02014b50
    )
      throw new Error("The Office document has an invalid or oversized compressed directory.");
    const length =
      46 +
      data.getUint16(offset + 28, true) +
      data.getUint16(offset + 30, true) +
      data.getUint16(offset + 32, true);
    if (offset + length > start + size || (data.getUint16(offset + 8, true) & 1) !== 0)
      throw new Error("Encrypted or incomplete Office documents are not supported.");
    offset += length;
  }
  if (entries !== count)
    throw new Error("The Office document has an inconsistent compressed directory.");
}

export async function boundedZipEntry(
  entry: JSZip.JSZipObject,
  limit: number,
  signal?: AbortSignal,
): Promise<Uint8Array> {
  signal?.throwIfAborted();
  if (!Number.isSafeInteger(limit) || limit < 1) throw new Error("Invalid document read limit.");
  return new Promise((resolve, reject) => {
    const stream = (entry as JSZip.JSZipObject & { internalStream(type: "uint8array"): JSZip.JSZipStreamHelper<Uint8Array> }).internalStream("uint8array");
    const chunks: Uint8Array[] = [];
    let size = 0,
      settled = false;
    const cleanup = () => {
      clearTimeout(timer);
      signal?.removeEventListener("abort", abort);
    };
    const fail = (error: Error) => {
      if (settled) return;
      settled = true;
      stream.pause();
      chunks.length = 0;
      cleanup();
      reject(error);
    };
    const abort = () => fail(new Error("Document extraction cancelled."));
    const timer = setTimeout(
      () =>
        fail(
          new Error("This compressed document took too long to read. Split it into smaller files."),
        ),
      10000,
    );
    signal?.addEventListener("abort", abort, { once: true });
    stream
      .on("data", (chunk: Uint8Array) => {
        if (settled) return;
        size += chunk.byteLength;
        if (size > limit) {
          fail(
            new Error(
              "The document contains oversized compressed contents. Split it into smaller files.",
            ),
          );
          return;
        }
        chunks.push(chunk);
      })
      .on("error", () => fail(new Error("The compressed document could not be read.")))
      .on("end", () => {
        if (settled) return;
        settled = true;
        cleanup();
        const bytes = new Uint8Array(size);
        let offset = 0;
        for (const chunk of chunks) {
          bytes.set(chunk, offset);
          offset += chunk.byteLength;
        }
        resolve(bytes);
      })
      .resume();
  });
}

export async function inspectOfficeDocument(
  buffer: ArrayBuffer,
  keep: (name: string) => boolean,
  signal?: AbortSignal,
) {
  signal?.throwIfAborted();
  inspectOfficeDirectory(buffer);
  const JSZip = (await import("jszip")).default;
  const zip = await JSZip.loadAsync(buffer);
  const entries = Object.values(zip.files);
  if (entries.length > OFFICE_ENTRY_LIMIT)
    throw new Error("This document has too many embedded files. Split it into smaller files.");
  const selected = new Map<string, string>();
  let remaining = OFFICE_TOTAL_XML_LIMIT;
  const started = Date.now();
  for (const entry of entries) {
    signal?.throwIfAborted();
    if (Date.now() - started > 30000)
      throw new Error("This document took too long to inspect. Split it into smaller files.");
    const original =
      (entry as JSZip.JSZipObject & { unsafeOriginalName?: string }).unsafeOriginalName ??
      entry.name;
    if (original.includes("\\") || original.startsWith("/") || original.split("/").includes(".."))
      throw new Error("The document contains unsafe embedded file paths.");
    if (entry.dir || !/\.(xml|rels)$/i.test(entry.name)) continue;
    if (remaining <= 0) throw new Error("Expanded document text exceeds the supported size.");
    const bytes = await boundedZipEntry(entry, Math.min(OFFICE_XML_LIMIT, remaining), signal);
    remaining -= bytes.byteLength;
    const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    if (/<!\s*(?:DOCTYPE|ENTITY)\b/i.test(text))
      throw new Error(
        "Document type and entity declarations are not supported in imported Office files.",
      );
    if (keep(entry.name)) selected.set(entry.name, text);
  }
  signal?.throwIfAborted();
  return selected;
}
