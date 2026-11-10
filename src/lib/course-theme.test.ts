import { describe, expect, it } from "vitest";
import { courseThemeStyle, isCourseTheme } from "./course-theme";

describe("course theme", () => {
  it("recognises only the fixed preset names", () => {
    expect(isCourseTheme("forest")).toBe(true);
    expect(isCourseTheme("neon-hotpink")).toBe(false);
    expect(isCourseTheme(null)).toBe(false);
  });
  it("falls back to the default theme for an unknown or missing value", () => {
    expect(courseThemeStyle("not-a-theme")).toEqual(courseThemeStyle("default"));
    expect(courseThemeStyle(null)).toEqual(courseThemeStyle(undefined));
  });
  it("returns distinct primary colours per theme", () => {
    expect(courseThemeStyle("forest")["--primary"]).not.toBe(courseThemeStyle("clay")["--primary"]);
  });
});
