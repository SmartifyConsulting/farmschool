import { describe, expect, it } from "vitest";
import { cmiChildren, cmiCount, scormLessonRef } from "./scorm";

describe("scorm runtime", () => {
  it("answers _children keywords Articulate reads at launch", () => {
    expect(cmiChildren("cmi.core.score._children")).toBe("raw,min,max");
    expect(cmiChildren("cmi.core.lesson_status")).toBeNull();
  });
  it("counts interactions by distinct index", () => {
    expect(cmiCount({ "cmi.interactions.0.id": "a", "cmi.interactions.0.result": "correct", "cmi.interactions.1.id": "b" }, "cmi.interactions._count")).toBe(2);
  });
  it("reads the package id linked to a Studio lesson", () => {
    expect(scormLessonRef("scorm:123e4567-e89b-12d3-a456-426614174000")).toBe("123e4567-e89b-12d3-a456-426614174000");
    expect(scormLessonRef("plain notes")).toBeNull();
  });
});
