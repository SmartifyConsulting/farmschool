import { describe, expect, it } from "vitest";
import { buildXapiStatements, summariseCompliance, type XapiInput } from "./xapi";

const base: XapiInput = {
  courses: [{ id: "c1", title: "Beekeeping" }],
  lessons: [
    { id: "l1", course_id: "c1", title: "Hive basics" },
    { id: "l2", course_id: "c1", title: "Quiz" },
  ],
  progress: [],
  attempts: [],
  scormPackages: [],
  scormAttempts: [],
  certificates: [],
};

describe("buildXapiStatements", () => {
  it("emits a completed statement for a finished lesson", () => {
    const statements = buildXapiStatements({
      ...base,
      progress: [
        {
          user_id: "u1",
          course_id: "c1",
          lesson_id: "l1",
          completed: true,
          updated_at: "2026-01-01T00:00:00Z",
        },
      ],
    });
    expect(statements).toHaveLength(1);
    expect(statements[0]!.verb.display["en-US"]).toBe("completed");
    expect(statements[0]!.actor.account.name).toBe("u1");
    expect(statements[0]!.object.id).toContain("l1");
  });

  it("emits passed vs failed for quiz attempts, with a scaled score", () => {
    const statements = buildXapiStatements({
      ...base,
      attempts: [
        {
          user_id: "u1",
          course_id: "c1",
          lesson_id: "l2",
          score: 90,
          passed: true,
          created_at: "2026-01-02T00:00:00Z",
        },
        {
          user_id: "u2",
          course_id: "c1",
          lesson_id: "l2",
          score: 40,
          passed: false,
          created_at: "2026-01-02T00:00:00Z",
        },
      ],
    });
    expect(statements.find((s) => s.actor.account.name === "u1")!.verb.display["en-US"]).toBe(
      "passed",
    );
    expect(statements.find((s) => s.actor.account.name === "u1")!.result?.score?.scaled).toBe(0.9);
    expect(statements.find((s) => s.actor.account.name === "u2")!.verb.display["en-US"]).toBe(
      "failed",
    );
  });

  it("produces the same statement id for the same facts, so re-exports are idempotent", () => {
    const input = {
      ...base,
      progress: [
        {
          user_id: "u1",
          course_id: "c1",
          lesson_id: "l1",
          completed: true,
          updated_at: "2026-01-01T00:00:00Z",
        },
      ],
    };
    expect(buildXapiStatements(input)[0]!.id).toBe(buildXapiStatements(input)[0]!.id);
  });
});

describe("summariseCompliance", () => {
  it("flags a learner who hasn't finished every lesson as not compliant", () => {
    const rows = summariseCompliance({
      ...base,
      progress: [
        { user_id: "u1", course_id: "c1", lesson_id: "l1", completed: true, updated_at: "t" },
      ],
    });
    expect(rows).toEqual([
      {
        userId: "u1",
        courseId: "c1",
        courseTitle: "Beekeeping",
        completionRate: 50,
        certified: false,
        compliant: false,
      },
    ]);
  });

  it("treats a certificate as compliant even if completion tracking is incomplete", () => {
    const rows = summariseCompliance({
      ...base,
      progress: [
        { user_id: "u1", course_id: "c1", lesson_id: "l1", completed: true, updated_at: "t" },
      ],
      certificates: [
        { user_id: "u1", source: "studio", course_ref: "c1", title: "Beekeeping", issued_at: "t" },
      ],
    });
    expect(rows[0]!.compliant).toBe(true);
  });
});
