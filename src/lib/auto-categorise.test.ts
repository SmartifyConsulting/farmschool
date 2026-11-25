import { describe, expect, it } from "vitest";
import { suggestSector, validSector } from "./auto-categorise";

describe("industry suggestions", () => {
  it.each([
    ["Business Ideas ILO Training Manual", "Business and Professional Services"],
    ["Finance Theory Investments and Portfolios", "Financial Services"],
    ["Algorithms and Data Structures MIT Notes", "Information Technology"],
    ["Understanding Autism Experiences and Support", "Healthcare"],
    ["Beekeeping Harvesting Honey", "Agriculture"],
    ["Linear Algebra Vectors and Matrices", "Education and Training"],
  ])("recognises %s without relying on the old course category", (title, expected) => {
    expect(suggestSector(title)).toBe(expected);
  });
  it("leaves unclear and mixed subjects for review", () => {
    expect(suggestSector("Document 42")).toBe("");
    expect(suggestSector("Finance and Programming")).toBe("");
    expect(suggestSector("Reference", "General supporting material")).toBe("");
  });
  it("uses a clear title ahead of generic description keywords", () => {
    expect(suggestSector("Python Programming", "Agriculture crop training")).toBe(
      "Information Technology",
    );
    expect(validSector("Unknown category")).toBe(false);
    expect(validSector("Uncategorised")).toBe(false);
  });
});
