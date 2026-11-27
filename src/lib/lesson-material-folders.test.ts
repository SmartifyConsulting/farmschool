import { describe, expect, it } from "vitest";
import {
  DRAFT_MATERIAL_PREFIX,
  pairedLibraryMaterials,
  producedMaterialStatus,
} from "./lesson-material-folders";
import type { LibraryFile } from "./library-materials";

function file(
  id: string,
  stage: "raw" | "produced",
  extra: Partial<LibraryFile> = {},
): LibraryFile {
  return {
    id,
    material_stage: stage,
    file_name: "Same title.pdf",
    original_file_name: "Same title.pdf",
    storage_path: id,
    file_type: "pdf",
    size_bytes: 100,
    description: "",
    created_at: "2026-11-27T08:00:00Z",
    folder_id: null,
    keywords: [],
    classification: "",
    ...extra,
  };
}
describe("paired raw and produced material", () => {
  it("keeps unrelated same-name files separate instead of guessing lineage", () => {
    const groups = pairedLibraryMaterials(
      [file("raw-a", "raw"), file("raw-b", "raw"), file("output", "produced")],
      [],
    );
    expect(groups).toHaveLength(3);
    expect(groups.filter((group) => group.status === "Not started")).toHaveLength(2);
    expect(groups.find((group) => group.id === "output")?.sources).toEqual([]);
  });
  it("keeps multiple sources and every output version together without modifying originals", () => {
    const files = [
      file("raw-a", "raw"),
      file("raw-b", "raw"),
      file("draft", "produced", {
        description: DRAFT_MATERIAL_PREFIX + "HTML training",
        created_at: "2026-11-27T09:00:00Z",
      }),
      file("completed", "produced", { created_at: "2026-11-27T10:00:00Z" }),
    ];
    const before = JSON.stringify(files);
    const groups = pairedLibraryMaterials(files, [
      { raw_file_id: "raw-a", produced_file_id: "draft" },
      { raw_file_id: "raw-b", produced_file_id: "draft" },
      { raw_file_id: "raw-a", produced_file_id: "completed" },
    ]);
    expect(groups).toHaveLength(2);
    expect(groups[0]?.sources).toHaveLength(1);
    expect(groups[0]?.outputs.map((output) => output.id)).toEqual(["completed", "draft"]);
    expect(groups[0]?.status).toBe("Completed");
    expect(groups[0]?.id).toBe("raw-a");
    expect(groups[1]?.sources[0]?.id).toBe("raw-b");
    expect(groups[1]?.outputs.map((output) => output.id)).toEqual(["draft"]);
    expect(JSON.stringify(files)).toBe(before);
  });
  it("shows a newer draft without hiding previously completed material", () => {
    const files = [
      file("raw", "raw"),
      file("old-complete", "produced"),
      file("new-draft", "produced", {
        description: DRAFT_MATERIAL_PREFIX + "HTML training",
        created_at: "2026-11-27T11:00:00Z",
      }),
    ];
    const group = pairedLibraryMaterials(files, [
      { raw_file_id: "raw", produced_file_id: "old-complete" },
      { raw_file_id: "raw", produced_file_id: "new-draft" },
    ])[0]!;
    expect(group.status).toBe("Draft");
    expect(group.outputs.filter((f) => producedMaterialStatus(f) === "Completed")).toHaveLength(1);
    expect(group.sources[0]?.id).toBe("raw");
  });
  it("ignores dangling links and duplicate links without losing visible files", () => {
    const groups = pairedLibraryMaterials(
      [file("raw", "raw"), file("output", "produced")],
      [
        { raw_file_id: "missing", produced_file_id: "output" },
        { raw_file_id: "raw", produced_file_id: "output" },
        { raw_file_id: "raw", produced_file_id: "output" },
      ],
    );
    expect(groups).toHaveLength(1);
    expect(groups[0]?.outputs).toHaveLength(1);
  });
});
