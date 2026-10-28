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

  it("skips cover and table-of-contents pages before actual module content", () => {
    const draft = buildCourseDraft("Beekeeping", [
      { sourceId: "manual", page: 1, text: ["Birds and Bees", "SHORT LEARNING PROGRAMME", "entrepreneurship", "capacity", "pollinators"].join("\n") },
      { sourceId: "manual", page: 2, text: ["TABLE OF CONTENTS", "MODULE 1 - KNOWING THE BEE", "MODULE 2 - THE HONEYBEE COLONY", "MODULE 3 - BEEKEEPING", "MODULE 4 - BEE HEALTH"].join("\n") },
      { sourceId: "manual", page: 3, text: ["MODULE 1 - KNOWING THE BEE", "Honeybees live in organised colonies. Workers forage for food."].join("\n") },
    ]);
    expect(draft.lessons.map(x => x.title)).toEqual(["MODULE 1 - KNOWING THE BEE"]);
    expect(draft.lessons[0]?.sourceRefs).toEqual([{ sourceId: "manual", page: 3 }]);
  });

  it("keeps numbered facts within the current module instead of making them lessons", () => {
    const draft = buildCourseDraft("Beekeeping", [{
      sourceId: "manual", page: 7,
      text: ["MODULE 1", "Bees live in organised colonies.", "7 bee families (apidae) across the world.", "12 subspecies in Africa with different characteristics."].join("\n"),
    }]);
    expect(draft.lessons).toHaveLength(1);
    expect(draft.lessons[0]?.title).toBe("MODULE 1");
    expect(draft.lessons[0]?.body).toContain("7 bee families");
    expect(draft.lessons[0]?.body).toContain("12 subspecies");
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
