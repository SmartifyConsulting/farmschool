import { describe, expect, it } from "vitest";
import { latestCompetencyEvidence } from "./competency-evidence";

describe("learner competency outcomes", () => {
  it("uses the most recent assessment rather than a historical outcome", () => {
    const old = {
      id: "old",
      competency_id: "skill",
      assessed_at: "2026-11-01T10:00:00Z",
      created_at: "2026-11-01T10:00:00Z",
      achieved: false,
    };
    const recent = { ...old, id: "new", assessed_at: "2026-11-12T10:00:00Z", achieved: true };
    expect(latestCompetencyEvidence([old, recent])).toEqual([recent]);
  });
  it("retains separate competencies and does not mutate history", () => {
    const rows = [
      { id: "first", competency_id: "one", assessed_at: null, created_at: "2026-11-01T10:00:00Z" },
      { id: "second", competency_id: "two", assessed_at: null, created_at: "2026-11-12T10:00:00Z" },
    ];
    expect(latestCompetencyEvidence(rows).map((row) => row.id)).toEqual(["second", "first"]);
    expect(rows[0]?.id).toBe("first");
  });
});
