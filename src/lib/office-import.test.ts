import JSZip from "jszip";
import { expect, it } from "vitest";
import { boundedZipEntry, inspectOfficeDocument, inspectOfficeDirectory } from "./office-import";
it("stops expansion at the byte budget even when compressed input is tiny", async () => {
  const source = new JSZip().file("word/document.xml", "a".repeat(65536));
  const compressed = await source.generateAsync({ type: "uint8array", compression: "DEFLATE" });
  expect(compressed.byteLength).toBeLessThan(1000);
  const zip = await JSZip.loadAsync(compressed);
  await expect(boundedZipEntry(zip.file("word/document.xml")!, 1024)).rejects.toThrow("oversized");
});
it("retains selected XML after checking other Office metadata", async () => {
  const source = new JSZip()
    .file("ppt/slides/slide1.xml", "<slide>Training</slide>")
    .file("ppt/_rels/presentation.xml.rels", "<Relationships/>");
  const content = await inspectOfficeDocument(
    await source.generateAsync({ type: "arraybuffer" }),
    (name) => name.startsWith("ppt/slides/"),
  );
  expect([...content]).toEqual([["ppt/slides/slide1.xml", "<slide>Training</slide>"]]);
});
it("rejects entity declarations and unsafe paths instead of passing them to a document parser", async () => {
  const declared = await new JSZip()
    .file("word/document.xml", '<!DOCTYPE a [<!ENTITY x "value">]><a>&x;</a>')
    .generateAsync({ type: "arraybuffer" });
  await expect(inspectOfficeDocument(declared, () => true)).rejects.toThrow("entity declarations");
  const escaped = await new JSZip()
    .file("../word/document.xml", "<a/>")
    .generateAsync({ type: "arraybuffer" });
  await expect(inspectOfficeDocument(escaped, () => true)).rejects.toThrow("unsafe");
});
it("respects cancellation before decompression starts", async () => {
  const controller = new AbortController();
  controller.abort();
  await expect(
    boundedZipEntry(new JSZip().file("text", "text").file("text")!, 100, controller.signal),
  ).rejects.toThrow();
});
it("rejects oversized or forged directories before creating zip entry objects", async () => {
  const bytes = await new JSZip()
    .file("word/document.xml", "<a/>")
    .generateAsync({ type: "arraybuffer" });
  expect(() => inspectOfficeDirectory(bytes)).not.toThrow();
  const invalid = bytes.slice(0);
  const view = new DataView(invalid),
    end = invalid.byteLength - 22;
  view.setUint16(end + 8, 2001, true);
  view.setUint16(end + 10, 2001, true);
  expect(() => inspectOfficeDirectory(invalid)).toThrow("too many");
  expect(() => inspectOfficeDirectory(new ArrayBuffer(4))).toThrow("invalid");
});
