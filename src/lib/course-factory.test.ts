import { describe, expect, it } from "vitest";
import { buildCourseDraft, canAutoPublish, splitDraftLesson, mergeDraftLessons } from "./course-factory";

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

  it("starts at page 3 after a cover and contents, retaining numbered opening topics", () => {
    const draft = buildCourseDraft("Water", [
      { sourceId: "manual", page: 1, text: "Water Training Manual" },
      { sourceId: "manual", page: 2, text: "Contents\n1. Introduction .... 3\n2. Wetlands .... 4\nModule 3: Practice .... 5" },
      { sourceId: "manual", page: 3, text: "1. Introduction\nWater supports life.\nCheck local water sources." },
      { sourceId: "manual", page: 4, text: "2. Wetlands\nWetlands store water." },
      { sourceId: "manual", page: 5, text: "Module 3: Practice\nInspect the catchment." },
    ]);
    expect(draft.lessons.map(lesson => lesson.title)).toEqual(["1. Introduction", "2. Wetlands", "Module 3: Practice"]);
    expect(draft.lessons[0]?.sourceRefs).toEqual([{ sourceId: "manual", page: 3 }]);
    expect(draft.lessons[0]?.body).toContain("Check local water sources.");
  });

  it("retains unlabelled opening content before Module 3", () => {
    const draft = buildCourseDraft("Water", [
      { sourceId: "manual", page: 3, text: "Water supports life.\nKeep sources clean." },
      { sourceId: "manual", page: 4, text: "Module 3: Practice\nInspect the catchment." },
    ]);
    expect(draft.lessons[0]?.body).toBe("Water supports life.\n\nKeep sources clean.");
    expect(draft.lessons[0]?.sourceRefs[0]?.page).toBe(3);
  });

  it("recognises table-of-contents topic names on content pages", () => {
    const draft = buildCourseDraft("Water", [
      { sourceId: "manual", page: 2, text: "Contents\nUnderstanding water .... 3" },
      { sourceId: "manual", page: 3, text: "Understanding water\nWater supports life." },
    ]);
    expect(draft.lessons[0]?.title).toBe("Understanding water");
  });

  it("respects the trainer’s first content page", () => {
    const draft = buildCourseDraft("Water", [
      { sourceId: "manual", page: 1, text: "An unusually long cover description that should be excluded." },
      { sourceId: "manual", page: 3, text: "Water supports life." },
    ], 3);
    expect(draft.lessons[0]?.body).toBe("Water supports life.");
    expect(draft.lessons[0]?.sourceRefs).toEqual([{ sourceId: "manual", page: 3 }]);
  });

  it("splits long content at paragraph boundaries without continued titles or text loss", () => {
    const paragraphs = Array.from({ length: 80 }, (_, index) => `Paragraph ${index}: ${"Water supports life. ".repeat(20)}`.trim());
    const draft = buildCourseDraft("Water", [{ sourceId: "manual", page: 3, text: "Module 1: Water\n" + paragraphs.join("\n") }]);
    expect(draft.lessons.length).toBeGreaterThan(1);
    expect(draft.lessons.map(lesson => lesson.body).join("\n\n")).toBe(paragraphs.join("\n\n"));
    expect(draft.lessons.some(lesson => lesson.title.includes("continued"))).toBe(false);
  });

  it("split and merge preserve all content and source evidence", () => {
    const lesson = { title: "Water", body: "First paragraph.\n\nSecond paragraph.", sourceRefs: [{ sourceId: "manual", page: 3 }], reviewRequired: true as const };
    const parts = splitDraftLesson(lesson, 18);
    expect(parts.map(part => part.body)).toEqual(["First paragraph.", "Second paragraph."]);
    const [first, second] = parts;
    if (!first || !second) throw new Error("Missing split parts");
    expect(mergeDraftLessons(first, second)).toEqual(lesson);
  });

  it("splits module headings into separately reviewable lessons", () => {
    const draft = buildCourseDraft("Example", [{
      sourceId: "manual", page: 1,
      text: "Module 1: Basics\nFirst lesson.\nModule 2: Practice\nSecond lesson.",
    }]);
    expect(draft.lessons.map((lesson) => lesson.title)).toEqual(["Module 1: Basics", "Module 2: Practice"]);
  });
});
