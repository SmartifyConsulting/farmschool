import { describe, expect, it } from "vitest";
import {
  MAX_SUBMISSION_FILE_BYTES,
  submissionFilePath,
  validateSubmissionFile,
} from "./submission-files";

const id = "10000000-0000-4000-8000-000000000001";
describe("private submission files", () => {
  it("accepts supported files and infers missing browser MIME types", () => {
    expect(validateSubmissionFile({ name: "evidence.PDF", size: 100, type: "" })).toMatchObject({
      contentType: "application/pdf",
    });
    expect(
      validateSubmissionFile({
        name: "notes.txt",
        size: MAX_SUBMISSION_FILE_BYTES,
        type: "text/plain",
      }),
    ).toMatchObject({ name: "notes.txt" });
  });
  it.each([0, -1, MAX_SUBMISSION_FILE_BYTES + 1, NaN, 2.5])(
    "rejects invalid file size: %s",
    (size) => {
      expect(() =>
        validateSubmissionFile({ name: "evidence.pdf", size, type: "application/pdf" }),
      ).toThrow();
    },
  );
  it.each(["script.html", "image.svg", "macro.docm", "archive.zip"])(
    "rejects unsupported evidence: %s",
    (name) => {
      expect(() => validateSubmissionFile({ name, size: 100, type: "" })).toThrow();
    },
  );
  it("rejects conflicting extension and MIME type", () => {
    expect(() =>
      validateSubmissionFile({ name: "evidence.pdf", size: 100, type: "text/html" }),
    ).toThrow();
  });
  it("builds isolated paths without filename traversal or control characters", () => {
    const file = submissionFilePath(
      id,
      id,
      { name: "../../Field notes\n.pdf", size: 100, type: "application/pdf" },
      id,
    );
    expect(file.path.split("/")).toHaveLength(3);
    expect(file.path).not.toContain("\n");
    expect(file.name).toBe("Field_notes_.pdf");
  });
});
