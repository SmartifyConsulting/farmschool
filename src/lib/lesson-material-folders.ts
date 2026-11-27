import { linkedMaterials, type Derivation, type LibraryFile } from "./library-materials";

export type ProducedStatus = "Draft" | "Completed";
export const DRAFT_MATERIAL_PREFIX = "[Plusticity draft] ";
export function producedMaterialStatus(file: Pick<LibraryFile, "description">): ProducedStatus {
  return file.description.startsWith(DRAFT_MATERIAL_PREFIX) ? "Draft" : "Completed";
}
export type LessonMaterialFolder = {
  id: string;
  title: string;
  sources: LibraryFile[];
  outputs: LibraryFile[];
  status: "Not started" | ProducedStatus;
};
/** A source reused for several outputs stays one row; shared outputs appear beside each source. */
export function pairedLibraryMaterials(
  files: LibraryFile[],
  links: Derivation[],
): LessonMaterialFolder[] {
  const rows = files
    .filter((file) => file.material_stage === "raw")
    .map((source) => {
      const outputs = linkedMaterials(source.id, "raw", files, links)
        .filter((file) => file.material_stage === "produced")
        .sort((a, b) => b.created_at.localeCompare(a.created_at) || a.id.localeCompare(b.id));
      return {
        id: source.id,
        title: source.file_name,
        sources: [source],
        outputs,
        status: outputs[0] ? producedMaterialStatus(outputs[0]) : ("Not started" as const),
      };
    });
  const linked = new Set(rows.flatMap((row) => row.outputs.map((file) => file.id)));
  return [
    ...rows,
    ...files
      .filter((file) => file.material_stage === "produced" && !linked.has(file.id))
      .map((file) => ({
        id: file.id,
        title: file.file_name,
        sources: [],
        outputs: [file],
        status: producedMaterialStatus(file),
      })),
  ].sort((a, b) => a.title.localeCompare(b.title));
}
