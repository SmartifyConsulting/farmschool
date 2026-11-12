import { z } from "zod";

export const SUBMISSION_FILE_BUCKET = "competency-evidence";
export const MAX_SUBMISSION_FILE_BYTES = 5 * 1024 * 1024;
const types: Record<string, string> = {
  pdf: "application/pdf",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  txt: "text/plain",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
};

export function validateSubmissionFile(file: { name: string; size: number; type: string }) {
  if (!Number.isSafeInteger(file.size) || file.size <= 0 || file.size > MAX_SUBMISSION_FILE_BYTES)
    throw new Error("Choose a non-empty file up to 5 MB.");
  const original = file.name.split(/[\\/]/).pop() ?? "";
  const extension = original.split(".").pop()?.toLowerCase() ?? "";
  const contentType = types[extension];
  if (!contentType || (file.type && file.type !== contentType))
    throw new Error("Supported evidence files: PDF, DOCX, TXT, PNG, JPEG and WebP.");
  const name = original.replace(/[^A-Za-z0-9._-]/g, "_").slice(-100);
  if (!name) throw new Error("Choose a file with a valid name.");
  return { name, contentType };
}

export function submissionFilePath(
  userId: string,
  competencyId: string,
  file: { name: string; size: number; type: string },
  fileId = crypto.randomUUID(),
) {
  const metadata = validateSubmissionFile(file);
  const ids = [userId, competencyId, fileId].map((id) => z.string().uuid().parse(id).toLowerCase());
  return { ...metadata, path: `${ids[0]}/${ids[1]}/${ids[2]}-${metadata.name}` };
}
