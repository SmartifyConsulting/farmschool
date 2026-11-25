import { describe, expect, it } from "vitest";
import {
  canTransform,
  libraryFolderPath,
  linkedMaterials,
  materialSector,
  matchesMaterialType,
  portableMaterialText,
  sectorKeywords,
  type LibraryFile,
} from "./library-materials";

const raw: LibraryFile = {
  id: "a",
  file_name: "Source.txt",
  original_file_name: "Source.txt",
  file_type: "text",
  storage_path: "owner/source.txt",
  size_bytes: 100,
  description: "",
  created_at: "2026-11-25",
  folder_id: null,
  material_stage: "raw",
  keywords: ["soil", "sector:Agriculture"],
  classification: "",
};
const output: LibraryFile = {
  ...raw,
  id: "out",
  material_stage: "produced",
  keywords: [],
  file_name: "Lesson.md",
  original_file_name: "Lesson.md",
};
describe("library materials", () => {
  it("derives Processed status only from saved output links", () => {
    expect(linkedMaterials("a", "raw", [raw, output], [])).toEqual([]);
    expect(
      linkedMaterials("a", "raw", [raw, output], [{ raw_file_id: "a", produced_file_id: "out" }]),
    ).toEqual([output]);
    expect(
      linkedMaterials("a", "raw", [raw], [{ raw_file_id: "a", produced_file_id: "out" }]),
    ).toEqual([]);
  });
  it("inherits sector from sources and handles mixed sectors without guessing", () => {
    const other = { ...raw, id: "b", keywords: ["sector:Financial Services"] };
    const links = [{ raw_file_id: "a", produced_file_id: "out" }];
    expect(materialSector(output, [raw, output], links)).toBe("Agriculture");
    expect(
      materialSector(
        output,
        [raw, other, output],
        [...links, { raw_file_id: "b", produced_file_id: "out" }],
      ),
    ).toBe("General and Cross-industry");
    expect(raw.keywords).toEqual(["soil", "sector:Agriculture"]);
  });
  it("changes a sector tag while preserving other keywords", () => {
    expect(sectorKeywords(raw.keywords, "Education and Training")).toEqual([
      "soil",
      "sector:Education and Training",
    ]);
    expect(() => sectorKeywords([], "not a sector")).toThrow();
  });
  it("keeps Word, images, video and text filters distinct", () => {
    expect(
      matchesMaterialType({ ...raw, original_file_name: "a.docx", file_type: "document" }, "Word"),
    ).toBe(true);
    expect(
      matchesMaterialType({ ...raw, original_file_name: "a.pptx", file_type: "document" }, "Word"),
    ).toBe(false);
    expect(matchesMaterialType({ ...raw, file_type: "image" }, "Images")).toBe(true);
    expect(matchesMaterialType({ ...raw, file_type: "video" }, "Videos")).toBe(true);
    expect(matchesMaterialType(output, "Text")).toBe(true);
  });
  it("enforces supported extraction type and source size limits", () => {
    expect(canTransform(raw)).toBe(true);
    expect(canTransform({ ...raw, original_file_name: "movie.mp4" })).toBe(false);
    expect(canTransform({ ...raw, size_bytes: 12 * 1024 * 1024 + 1 })).toBe(false);
  });
  it("resolves folder ancestry without looping on a corrupt cycle", () => {
    expect(
      libraryFolderPath("b", [
        { id: "a", name: "Safety", parent_id: null },
        { id: "b", name: "Manuals", parent_id: "a" },
      ]),
    ).toBe("Safety / Manuals");
    expect(libraryFolderPath("a", [{ id: "a", name: "Cycle", parent_id: "a" }])).toBe("Cycle");
  });
  it("exports readable teaching text rather than native fence markup", () => {
    const result = portableMaterialText(
      "## Safety\n:::text\nInspect equipment.\n:::\n:::checklist\n- Check guards\n- Report damage\n:::",
    );
    expect(result).toContain("Inspect equipment.");
    expect(result).toContain("Report damage");
    expect(result).not.toContain(":::");
  });
  it("rejects SCORM text export when it would discard a media activity", () => {
    expect(() =>
      portableMaterialText("## Task\n:::photo\nUpload proof of your work.\n:::"),
    ).toThrow();
  });
});
