import { describe, expect, it } from "vitest";
import { findEntryFile, normaliseStatus, parseManifest } from "./scorm";

describe("scorm", () => {
  it("reads title, version and launch file from a 1.2 manifest", () => {
    const xml = `<manifest><organizations><organization><title>Bee Safety</title></organization></organizations>
      <resources><resource identifier="r1" type="webcontent" adlcp:scormtype="sco" href="res/index.html"/></resources></manifest>`;
    expect(parseManifest(xml, "x", [])).toEqual({ title: "Bee Safety", version: "1.2", entryPath: "res/index.html" });
  });
  it("detects SCORM 2004", () => {
    expect(parseManifest(`<schemaversion>2004 4th Edition</schemaversion><resource href="story.html"/>`, "F", []).version).toBe("2004");
  });
  it("falls back to story.html when no manifest", () => {
    expect(findEntryFile(["a/b.js", "story.html"])).toBe("story.html");
  });
  it("passed/failed wins over completion", () => {
    expect(normaliseStatus(undefined, "completed", "failed")).toBe("failed");
    expect(normaliseStatus("passed", undefined, undefined)).toBe("passed");
  });
});
