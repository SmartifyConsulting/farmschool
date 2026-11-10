import { describe, expect, it } from "vitest";
import {
  formatManualAsSlides,
  parseLessonSlides,
  slideText,
  splitLessonSource,
} from "./lesson-slides";

describe("native lessons", () => {
  it("converts explicit manual callouts and checklists without changing the teaching text", () => {
    const original = [
      "## Hive inspection",
      "Look at the entrance before moving closer.",
      "Safety warning: Keep the entrance clear.",
      "- [ ] Record the time\n- [ ] Record the weather",
      "## Notes",
      "Compare observations over several visits.",
    ].join("\n\n");
    const slides = parseLessonSlides(formatManualAsSlides(original));
    expect(slides.map(({ title }) => title)).toEqual(["Hive inspection", "Notes"]);
    expect(slides[0]?.blocks).toEqual([
      { kind: "text", body: "Look at the entrance before moving closer." },
      { kind: "warning", body: "Keep the entrance clear." },
      { kind: "checklist", items: ["Record the time", "Record the weather"] },
    ]);
  });

  it("splits long source sections at paragraph boundaries and retains each paragraph", () => {
    const paragraphs = [
      "First source paragraph. ".repeat(28).trim(),
      "Second source paragraph. ".repeat(24).trim(),
    ];
    const slides = parseLessonSlides(formatManualAsSlides(paragraphs.join("\n\n")));
    expect(slides).toHaveLength(2);
    expect(
      slides.flatMap((slide) => slide.blocks.map((block) => ("body" in block ? block.body : ""))),
    ).toEqual(paragraphs);
  });

  it("excludes flashcard backs and internal source review notes from narration and the tutor", () => {
    const content =
      "## Field notes\n\n:::flip\nWhat should you record?\n---\nThe trainer's answer.\n:::\n\nUse a notebook.";
    const footer = "\n\nSource: Hive manual, page 4\nReview required before publishing.";
    expect(splitLessonSource(content + footer)).toEqual({ content, footer });
    const [slide] = parseLessonSlides(content + footer);
    expect(slideText(slide!, false)).toBe(
      "Field notes\n\nWhat should you record?\n\nUse a notebook.",
    );
    expect(slideText(slide!)).toContain("The trainer's answer.");
    expect(parseLessonSlides(content + "\n\nSource: Hive manual, page 4")).toEqual([slide]);
  });

  it("parses a photo task and a hotspot image with labelled points", () => {
    const content = [
      "## Hive check",
      ":::photo\nUpload a photo of your hive inspection.\n:::",
      ":::hotspot\nhttps://example.com/hive.jpg\n### 20,30 Frame\nA single wax frame.\n### 70,40 Queen excluder\nKeeps the queen in the brood box.\n:::",
    ].join("\n\n");
    const [slide] = parseLessonSlides(content);
    expect(slide?.blocks).toEqual([
      { kind: "photo", prompt: "Upload a photo of your hive inspection." },
      {
        kind: "hotspot",
        image: "https://example.com/hive.jpg",
        points: [
          { x: 20, y: 30, label: "Frame", body: "A single wax frame." },
          { x: 70, y: 40, label: "Queen excluder", body: "Keeps the queen in the brood box." },
        ],
      },
    ]);
    expect(slideText(slide!)).toContain("Queen excluder");
  });

  it("keeps malformed widget text readable and still recognises the following slide", () => {
    const slides = parseLessonSlides(
      "## One\n\n:::checklist\nKeep this text.\n\n## Two\n\nContinue here.",
    );
    expect(slides.map(({ title }) => title)).toEqual(["One", "Two"]);
    expect(slideText(slides[0]!)).toContain("Keep this text.");
    expect(slideText(slides[1]!)).toContain("Continue here.");
  });
});
