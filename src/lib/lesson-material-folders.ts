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
/** Only saved derivations join a source to an output; names never establish ownership or lineage. */
export function lessonMaterialFolders(
  files: LibraryFile[],
  links: Derivation[],
): LessonMaterialFolder[] {
  const remaining = new Map(files.map((f) => [f.id, f]));
  const groups: LessonMaterialFolder[] = [];
  for (const seed of files) {
    if (!remaining.has(seed.id)) continue;
    const members: LibraryFile[] = [];
    const queue = [seed];
    while (queue.length) {
      const file = queue.shift()!;
      if (!remaining.delete(file.id)) continue;
      members.push(file);
      queue.push(
        ...linkedMaterials(file.id, file.material_stage, files, links).filter((f) =>
          remaining.has(f.id),
        ),
      );
    }
    const sources = members
      .filter((f) => f.material_stage === "raw")
      .sort((a, b) => a.id.localeCompare(b.id));
    const outputs = members
      .filter((f) => f.material_stage === "produced")
      .sort((a, b) => b.created_at.localeCompare(a.created_at) || a.id.localeCompare(b.id));
    const first = sources[0] ?? outputs[0]!;
    groups.push({
      id: first.id,
      title: (outputs[0]?.file_name ?? first.file_name).replace(
        /\.(?:pdf|docx?|txt|md|html)$/i,
        "",
      ),
      sources,
      outputs,
      status: outputs[0] ? producedMaterialStatus(outputs[0]) : "Not started",
    });
  }
  return groups.sort((a, b) => a.title.localeCompare(b.title));
}
