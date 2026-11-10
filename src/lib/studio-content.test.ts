import { describe, expect, it } from "vitest";
import { detectContentFileType, inferModuleId } from "./studio-content";

describe("detectContentFileType", () => {
  it("maps known extensions", () => {
    expect(detectContentFileType("intro.mp4")).toBe("video");
    expect(detectContentFileType("Manual.PDF")).toBe("pdf");
    expect(detectContentFileType("notes.txt")).toBe("text");
    expect(detectContentFileType("package.zip")).toBe("scorm");
  });

  it("returns null for unsupported extensions", () => {
    expect(detectContentFileType("photo.png")).toBeNull();
    expect(detectContentFileType("noextension")).toBeNull();
  });
});

describe("inferModuleId", () => {
  const modules = [
    { id: "m1", title: "Module 1 · Soil Health" },
    { id: "m2", title: "Module 2 · Irrigation" },
  ];

  it("matches a file to the module sharing the most keywords", () => {
    expect(inferModuleId("soil-health-intro.mp4", modules)).toBe("m1");
    expect(inferModuleId("irrigation-basics.pdf", modules)).toBe("m2");
  });

  it("returns null when nothing matches", () => {
    expect(inferModuleId("random-file.txt", modules)).toBeNull();
  });

  it("returns null with no modules", () => {
    expect(inferModuleId("soil-health.mp4", [])).toBeNull();
  });
});
