import { describe, expect, it } from "vitest";
import { catalogueSector, sectorInitial } from "./catalogue-sectors";

describe("catalogue sector discovery", () => {
  it("classifies legacy course topics without changing their stored category", () => {
    expect(catalogueSector("Customer Service")).toBe("Business and Professional Services");
    expect(catalogueSector("Digital Literacy")).toBe("Information Technology");
    expect(catalogueSector("Financial Literacy")).toBe("Financial Services");
    expect(catalogueSector("Crop Farming")).toBe("Agriculture");
  });
  it("respects an explicit industry for topics shared by multiple industries", () => {
    expect(catalogueSector("Manufacturing / Workplace Safety")).toBe("Manufacturing");
    expect(catalogueSector("Workplace Safety")).toBe("General and Cross-industry");
  });
  it("recognises descriptive sector labels and keeps unknown topics discoverable", () => {
    expect(catalogueSector("Financial Services / Risk")).toBe("Financial Services");
    expect(catalogueSector("A new unclassified subject")).toBe("Uncategorised");
    expect(catalogueSector("")).toBe("Uncategorised");
  });
  it("filters folder initials independently of whitespace, case and accents", () => {
    expect(sectorInitial("  agriculture")).toBe("A");
    expect(sectorInitial("Éducation")).toBe("E");
    expect(sectorInitial("Financial Services")).toBe("F");
  });
});
