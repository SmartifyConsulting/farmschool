import { describe, expect, it, vi } from "vitest";
import {
  MAX_LESSON_CHARACTERS,
  MAX_SECTION_CHARACTERS,
  productionSectionBudget,
  produceSections,
  splitProductionSource,
} from "./library-production";

describe("large material section processing", () => {
  it("retains every character in order, prefers paragraphs, and keeps sections within the server limit", () => {
    const text = ("## Source heading\n\n" + "Learning content. ".repeat(4000) + "\n\n").repeat(8);
    const sections = splitProductionSource(text);
    expect(sections.length).toBeGreaterThan(1);
    expect(sections.join("")).toBe(text);
    expect(sections.every((section) => section.length <= MAX_SECTION_CHARACTERS)).toBe(true);
    expect(sections[0]!.endsWith("\n\n")).toBe(true);
  });
  it("does not split Unicode pairs or silently truncate oversized input", () => {
    const text = "a".repeat(99_999) + "😀" + "b".repeat(20);
    const parts = splitProductionSource(text);
    expect(parts.join("")).toBe(text);
    expect(parts[1]!.startsWith("😀")).toBe(true);
    expect(() => splitProductionSource("a".repeat(1_000_001))).toThrow("1,000,000");
  });
  it("budgets the combined output so it remains saveable", () => {
    for (let total = 1; total <= 20; total++)
      expect(productionSectionBudget(total) * total + 2 * (total - 1)).toBeLessThanOrEqual(
        MAX_LESSON_CHARACTERS,
      );
  });
  it("resumes after a failure without calling AI again for completed sections", async () => {
    const results: string[] = [];
    const generate = vi
      .fn()
      .mockResolvedValueOnce("Lesson one")
      .mockRejectedValueOnce(new Error("Allowance used up"));
    const options = {
      sections: ["source one", "source two", "source three"],
      results,
      generate,
      onProgress: vi.fn(),
      stopped: () => false,
    };
    await expect(produceSections(options)).rejects.toThrow("Allowance");
    expect(results).toEqual(["Lesson one"]);
    generate.mockResolvedValueOnce("Lesson two").mockResolvedValueOnce("Lesson three");
    expect(await produceSections(options)).toBe(true);
    expect(generate.mock.calls.map((call) => call[0])).toEqual([
      "source one",
      "source two",
      "source two",
      "source three",
    ]);
    expect(options.onProgress).toHaveBeenLastCalledWith(
      3,
      "Lesson one\n\nLesson two\n\nLesson three",
    );
  });
  it("stops between requests and preserves the completed section", async () => {
    let stop = false;
    const results: string[] = [];
    const generate = vi.fn().mockImplementation(async () => {
      stop = true;
      return "Completed section";
    });
    expect(
      await produceSections({
        sections: ["one", "two"],
        results,
        generate,
        onProgress: vi.fn(),
        stopped: () => stop,
      }),
    ).toBe(false);
    expect(generate).toHaveBeenCalledOnce();
    expect(results).toEqual(["Completed section"]);
  });
  it("does not cache empty or oversized section output", async () => {
    for (const body of [" ", "x".repeat(40_001)]) {
      const results: string[] = [];
      await expect(
        produceSections({
          sections: ["one"],
          results,
          generate: async () => body,
          onProgress: vi.fn(),
          stopped: () => false,
        }),
      ).rejects.toThrow("Retry");
      expect(results).toEqual([]);
    }
  });
});
