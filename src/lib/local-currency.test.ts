import { describe, expect, it } from "vitest";
import { convertedCoursePrice, countryCurrency, minorUnitFactor } from "./local-currency";

describe("country-based course price display", () => {
  it("uses saved country names and country codes without guessing legacy regions", () => {
    expect(countryCurrency("South Africa")?.currency).toBe("ZAR");
    expect(countryCurrency("GB")?.currency).toBe("GBP");
    expect(countryCurrency("Japan")?.currency).toBe("JPY");
    expect(countryCurrency("Gauteng")).toBeNull();
    expect(countryCurrency("")).toBeNull();
  });
  it("shows the exact R200 price for South Africa", () => {
    const result = convertedCoursePrice(20000, "zar", countryCurrency("South Africa"), null);
    expect(result.text).toBe("R\u00a0200,00");
    expect(result.estimated).toBe(false);
  });
  it("converts the displayed amount while retaining the original charge price", () => {
    const result = convertedCoursePrice(20000, "zar", countryCurrency("United Kingdom"), 0.04);
    expect(result.text).toBe("£8.00");
    expect(result.estimated).toBe(true);
    expect(result.original).toContain("200");
  });
  it("falls back to the listed price when rates are unavailable or invalid", () => {
    for (const rate of [null, 0, -2, NaN, Infinity]) {
      const result = convertedCoursePrice(20000, "zar", countryCurrency("United Kingdom"), rate);
      expect(result.estimated).toBe(false);
      expect(result.text).toBe(result.original);
    }
  });
  it("handles currency minor units independently of converted display decimals", () => {
    expect(minorUnitFactor("zar")).toBe(100);
    expect(minorUnitFactor("JPY")).toBe(1);
    expect(minorUnitFactor("KWD")).toBe(1000);
    expect(minorUnitFactor("ISK")).toBe(100);
    expect(convertedCoursePrice(20000, "zar", countryCurrency("Japan"), 7.5).text).toContain(
      "1,500",
    );
  });
});
