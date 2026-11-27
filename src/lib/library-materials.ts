import { catalogueSector, CATALOGUE_SECTORS } from "./catalogue-sectors";
import { parseLessonSlides, slideBlockLocations, slideText } from "./lesson-slides";

export type MaterialStage = "raw" | "produced";
export const MATERIAL_TYPES = ["All", "Videos", "PDF", "Word", "Images", "Text", "SCORM"] as const;
export type MaterialType = (typeof MATERIAL_TYPES)[number];
export function matchesMaterialType(
  file: Pick<LibraryFile, "file_type" | "original_file_name">,
  type: MaterialType,
) {
  return (
    type === "All" ||
    (type === "Word"
      ? /\.docx?$/i.test(file.original_file_name)
      : file.file_type ===
        (
          { Videos: "video", PDF: "pdf", Images: "image", Text: "text", SCORM: "scorm" } as Record<
            string,
            string
          >
        )[type])
  );
}
export function sectorKeywords(keywords: string[], sector: string) {
  if (!CATALOGUE_SECTORS.includes(sector)) throw new Error("Choose a recognised sector.");
  return [...keywords.filter((value) => !value.startsWith("sector:")), "sector:" + sector];
}
export function materialSector(
  file: LibraryFile,
  files: LibraryFile[],
  links: Derivation[],
  seen = new Set<string>(),
): string {
  if (seen.has(file.id)) return "Uncategorised";
  const tag = file.keywords?.find((value) => value.startsWith("sector:"))?.slice(7);
  if (tag && CATALOGUE_SECTORS.includes(tag)) return tag;
  if (file.material_stage === "produced") {
    const next = new Set(seen).add(file.id);
    const sectors = [
      ...new Set(
        linkedMaterials(file.id, "produced", files, links).map((raw) =>
          materialSector(raw, files, links, next),
        ),
      ),
    ];
    if (sectors.length === 1) return sectors[0]!;
    if (sectors.length > 1) return "General and Cross-industry";
  }
  return catalogueSector(file.classification ?? "");
}
export function portableMaterialText(body: string): string {
  const slides = parseLessonSlides(body);
  if (
    slideBlockLocations(slides).some(
      ({ block }) =>
        ["photo", "hotspot", "image", "video"].includes(block.kind) ||
        (block.kind === "facts" && block.items.some((item) => !!item.image)),
    )
  )
    throw new Error(
      "SCORM text export cannot preserve media or trainer-approved activities. Save an editable lesson to keep those blocks.",
    );
  return slides.map((slide) => slideText(slide)).join("\n\n");
}
export type LibraryFile = {
  id: string;
  file_name: string;
  original_file_name: string;
  file_type: string;
  storage_path: string;
  size_bytes: number;
  description: string;
  created_at: string;
  folder_id: string | null;
  material_stage: MaterialStage;
  keywords: string[];
  classification: string;
};
export type LibraryFolder = { id: string; name: string; parent_id: string | null; color?: string };
export type Derivation = { raw_file_id: string; produced_file_id: string };
export const libraryColumns =
  "id,file_name,original_file_name,file_type,storage_path,size_bytes,description,created_at,folder_id,material_stage,keywords,classification";
export function canTransform(file: Pick<LibraryFile, "original_file_name" | "size_bytes">) {
  return (
    /\.(pdf|docx|txt|md)$/i.test(file.original_file_name) && file.size_bytes <= 12 * 1024 * 1024
  );
}
export function linkedMaterials(
  id: string,
  stage: MaterialStage,
  files: LibraryFile[],
  links: Derivation[],
) {
  const ids = new Set(
    links
      .filter((link) => (stage === "raw" ? link.raw_file_id === id : link.produced_file_id === id))
      .map((link) => (stage === "raw" ? link.produced_file_id : link.raw_file_id)),
  );
  return files.filter((file) => ids.has(file.id));
}
export function libraryFolderPath(id: string | null, folders: LibraryFolder[]): string {
  const parts: string[] = [];
  const seen = new Set<string>();
  while (id && !seen.has(id)) {
    seen.add(id);
    const folder = folders.find((row) => row.id === id);
    if (!folder) break;
    parts.unshift(folder.name);
    id = folder.parent_id;
  }
  return parts.join(" / ");
}
