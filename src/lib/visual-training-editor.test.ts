import { describe, it, expect } from "vitest";
import { parseLessonSlides } from "./lesson-slides";
import { insertTrainingPart, updateTrainingPart } from "./visual-training-editor";
const body =
  "## Learn\nOriginal teaching.\n\n:::flip\nQuestion\n---\nAnswer\n:::\n\n## Confirm\nFinal teaching.\n\nSource: Manual.docx · section 1\nReview required before publishing.";
describe("visual webpart authoring", () => {
  it("edits a single part without changing other slides or the source review footer", () => {
    const next = updateTrainingPart(body, 0, 0, "replace", {
      kind: "text",
      body: "Edited teaching.",
    });
    expect(parseLessonSlides(next)[0]!.blocks[0]).toMatchObject({ body: "Edited teaching." });
    expect(parseLessonSlides(next)[1]).toEqual(parseLessonSlides(body)[1]);
    expect(next).toContain("Source: Manual.docx · section 1\nReview required before publishing.");
  });
  it("inserts, duplicates, reorders and removes structured parts without losing their properties", () => {
    const added = insertTrainingPart(body, 0, 0, {
      kind: "columns",
      columns: [
        [{ kind: "text", body: "First" }],
        [{ kind: "flip", front: "Prompt", back: "Feedback" }],
      ],
    });
    const duplicated = updateTrainingPart(added, 0, 1, "duplicate");
    expect(parseLessonSlides(duplicated)[0]!.blocks).toHaveLength(4);
    const moved = updateTrainingPart(duplicated, 0, 2, "up");
    expect(parseLessonSlides(moved)[0]!.blocks[1]).toEqual(parseLessonSlides(added)[0]!.blocks[1]);
    expect(parseLessonSlides(updateTrainingPart(moved, 0, 1, "remove"))[0]!.blocks).toHaveLength(3);
    expect(updateTrainingPart(body, 3, 0, "remove")).toBe(body);
  });
});
