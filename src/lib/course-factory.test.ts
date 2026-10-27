import { describe, expect, it } from "vitest";
import { buildCourseDraft, canAutoPublish } from "./course-factory";

describe("Course Factory draft builder", () => {
  it("preserves source text and page provenance", () => {
    const draft = buildCourseDraft("Beekeeping", [
      { sourceId: "manual-1", page: 3, text: "Module 1: Knowing the Bee\nHoneybees live in colonies." },
    ]);
    expect(draft.status).toBe("draft");
    expect(draft.lessons[0]?.title).toBe("Module 1: Knowing the Bee");
    expect(draft.lessons[0]?.body).toBe("Honeybees live in colonies.");
    expect(draft.lessons[0]?.sourceRefs).toEqual([{ sourceId: "manual-1", page: 3 }]);
    expect(draft.lessons[0]?.reviewRequired).toBe(true);
    expect(canAutoPublish(draft)).toBe(false);
  });

  it("flags unreadable pages instead of inventing lessons", () => {
    const draft = buildCourseDraft("Example", [{ sourceId: "scan", page: 1, text: " " }]);
    expect(draft.lessons).toHaveLength(0);
    expect(draft.warnings).toHaveLength(2);
  });

  it("rejects invalid provenance", () => {
    expect(() => buildCourseDraft("Example", [{ sourceId: "", page: 0, text: "Content" }])).toThrow();
  });

  it("splits module headings into separately reviewable lessons", () => {
    const draft = buildCourseDraft("Example", [{
      sourceId: "manual", page: 1,
      text: "Module 1: Basics\nFirst lesson.\nModule 2: Practice\nSecond lesson.",
    }]);
    expect(draft.lessons.map((lesson) => lesson.title)).toEqual(["Module 1: Basics", "Module 2: Practice"]);
  });
});
