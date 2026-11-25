import { describe, expect, it } from "vitest";
import {
  BLOCK_TEMPLATES,
  blockEntries,
  columnSources,
  replaceEntry,
  serializeBlocks,
  serializeColumns,
  validateGeneratedBlock,
} from "./lesson-block-editor";
import { parseBlocks, parseLessonSlides, slideBlockLocations, slideText } from "./lesson-slides";

describe("lesson block editing", () => {
  it("keeps inserted and generated text blocks distinct from neighbouring text", () => {
    const generated = validateGeneratedBlock("New generated text.", "text");
    const source = "Legacy paragraph.\n\n" + generated;
    expect(parseBlocks(source).map((block) => block.kind)).toEqual(["text", "text"]);
    expect(blockEntries(source)[1]!.source).toBe(generated);
    expect(parseBlocks(serializeBlocks(parseBlocks(source)))).toEqual(parseBlocks(source));
    const entry = blockEntries(source)[1]!;
    expect(replaceEntry(source, entry, generated, false)).toBe(source);
  });
  it.each(BLOCK_TEMPLATES)(
    "round-trips the $kind template and validates generated output",
    ({ kind, source }) => {
      const blocks = parseBlocks(source);
      expect(blocks).toHaveLength(1);
      expect(blocks[0]!.kind).toBe(kind);
      expect(parseBlocks(serializeBlocks(blocks))).toEqual(blocks);
      expect(validateGeneratedBlock(source, kind)).toBe(source);
    },
  );

  it("parses every non-column block inside a column without splitting at inner headings", () => {
    const childContent = BLOCK_TEMPLATES.filter((item) => item.kind !== "columns")
      .map((item) => item.source)
      .join("\n\n");
    const source =
      "## One\n:::columns\n" +
      childContent +
      "\n---col---\n## Inner heading\nOld plain column.\n:::\n## Two\nAfter.";
    const slides = parseLessonSlides(source);
    expect(slides.map((slide) => slide.title)).toEqual(["One", "Two"]);
    const columns = slides[0]!.blocks[0]!;
    expect(columns.kind).toBe("columns");
    if (columns.kind !== "columns") throw new Error("Expected columns");
    expect(columns.columns[0]!.map((block) => block.kind)).toEqual(
      BLOCK_TEMPLATES.filter((item) => item.kind !== "columns").map((item) => item.kind),
    );
    expect(columns.columns[1]).toEqual([
      { kind: "text", body: "## Inner heading\nOld plain column." },
    ]);
    expect(parseBlocks(serializeBlocks([columns]))).toEqual([columns]);
  });

  it("preserves old plain columns and permits empty columns while editing", () => {
    expect(parseBlocks(":::columns\nLeft\n---col---\nRight\n:::")).toEqual([
      {
        kind: "columns",
        columns: [[{ kind: "text", body: "Left" }], [{ kind: "text", body: "Right" }]],
      },
    ]);
    expect(parseBlocks(":::columns\n---col---\n:::")).toEqual([
      { kind: "columns", columns: [[], []] },
    ]);
  });

  it("keeps spaces and newlines through consecutive column edits", () => {
    let source = serializeColumns(["First", ":::tip\nKeep this.\n:::"]);
    for (const text of [
      "First ",
      "First word",
      "First word\n",
      "First word\nNext ",
      "First word\nNext line",
    ]) {
      const columns = columnSources(source);
      const entry = blockEntries(columns[0]!, true)[0]!;
      columns[0] = replaceEntry(columns[0]!, entry, text, false);
      source = serializeColumns(columns);
      expect(columnSources(source)[0]).toBe(text);
      expect(columnSources(source)[1]).toBe(":::tip\nKeep this.\n:::");
    }
  });

  it("keeps a column separator inside a child fence within that child", () => {
    const source = serializeColumns([":::tip\nText\n---col---\nStill the tip\n:::", "Other"]);
    expect(columnSources(source)).toHaveLength(2);
    expect(columnSources(source)[0]).toContain("Still the tip");
  });

  it("keeps widget boundaries when replacing text before another column block", () => {
    const column = "Left text.\n\n:::checklist\n- Task\n:::";
    const entry = blockEntries(column, true)[0]!;
    const changed = replaceEntry(column, entry, "Edited text ", false);
    expect(parseBlocks(changed, 1).map((block) => block.kind)).toEqual(["text", "checklist"]);
    expect(changed).toContain("Edited text \n\n:::checklist");
    expect(parseBlocks(serializeColumns([changed, "Other"]))[0]!.kind).toBe("columns");
  });

  it("keeps unrelated bytes and slide headings when replacing a block", () => {
    const source =
      "## First\n\nText  with spaces.\n\n:::tip\nOld tip.\n:::\n\n## Second\n\nKeep me.  \n";
    const entry = blockEntries(source).find((entry) => entry.block.kind === "tip")!;
    expect(replaceEntry(source, entry, ":::warning\nNew warning.\n:::")).toBe(
      source.replace(":::tip\nOld tip.\n:::", ":::warning\nNew warning.\n:::"),
    );
    expect(blockEntries(source).filter((entry) => entry.heading)).toHaveLength(2);
  });

  it("allocates distinct nested task IDs without changing existing top-level IDs", () => {
    const slides = parseLessonSlides(
      "## Tasks\n:::photo\nTop\n:::\n:::columns\n:::photo\nLeft\n:::\n---col---\n:::photo\nRight\n:::\n:::",
    );
    const locations = slideBlockLocations(slides);
    expect(
      locations.filter((item) => item.block.kind === "photo").map((item) => item.taskIndex),
    ).toEqual([2, 4, 5]);
    expect(new Set(locations.map((item) => item.taskIndex)).size).toBe(locations.length);
  });

  it("does not expose nested flashcard answers or practice options in tutor text", () => {
    const slides = parseLessonSlides(
      ":::columns\n:::flip\nQuestion\n---\nPrivate back\n:::\n---col---\n:::quizcheck\n### Check?\nA*: Secret correct\nA: Other\n:::\n:::",
    );
    const text = slideText(slides[0]!, false);
    expect(text).toContain("Question");
    expect(text).toContain("Check?");
    expect(text).not.toContain("Private back");
    expect(text).not.toContain("Secret correct");
  });

  it.each([
    [":::tip\nGood\n:::\nExtra", "tip"],
    [":::warning\nWrong kind\n:::", "tip"],
    [":::image\nhttp://unsafe.example/image.jpg\n:::", "image"],
    [":::quizcheck\n### Broken?\nA: No key\n:::", "quizcheck"],
    ["## New slide\nText", "text"],
    [":::columns\n:::columns\nOne\n---col---\nTwo\n:::\n---col---\nOther\n:::", "columns"],
  ] as const)("rejects invalid generated %s", (source, kind) => {
    expect(() => validateGeneratedBlock(source, kind)).toThrow();
  });
});
