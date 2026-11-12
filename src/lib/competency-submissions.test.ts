import { describe, expect, it } from "vitest";
import { competencySubmission } from "./competency-submissions";

const body = "I completed the practical task and documented the observed results.";
describe("competency submission input", () => {
  it("normalises secure evidence links before sending them to the database", () => {
    expect(
      competencySubmission.parse({ body, evidenceUrl: "HTTPS://EXAMPLE.COM/evidence" }).evidenceUrl,
    ).toBe("https://example.com/evidence");
  });
  it("accepts written work with optional secure evidence links", () => {
    expect(competencySubmission.safeParse({ body, evidenceUrl: "" }).success).toBe(true);
    expect(
      competencySubmission.safeParse({ body, evidenceUrl: "https://example.com/evidence" }).success,
    ).toBe(true);
  });
  it.each([
    "javascript:alert(1)",
    "http://example.com",
    "https://user:secret@example.com",
    "file:///evidence",
    "not a URL",
  ])("rejects unsafe evidence links: %s", (evidenceUrl) => {
    expect(competencySubmission.safeParse({ body, evidenceUrl }).success).toBe(false);
  });
  it("rejects empty and oversized work", () => {
    expect(competencySubmission.safeParse({ body: " ", evidenceUrl: "" }).success).toBe(false);
    expect(
      competencySubmission.safeParse({ body: "word ".repeat(5000), evidenceUrl: "" }).success,
    ).toBe(false);
  });
});
