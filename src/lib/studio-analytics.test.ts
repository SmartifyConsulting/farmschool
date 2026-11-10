import { describe, it, expect } from "vitest";
import { summariseRoster, summarisePlatform } from "./studio-analytics";

const lessons = [
  { id: "a", title: "A", kind: "reading" },
  { id: "q", title: "Q", kind: "quiz" },
];
const t = "2026-10-28T00:00:00Z";

describe("summariseRoster", () => {
  it("marks a learner who finished every lesson as Completed", () => {
    const r = summariseRoster({
      lessons,
      progress: [
        { user_id: "u", lesson_id: "a", completed: true, updated_at: t },
        { user_id: "u", lesson_id: "q", completed: true, updated_at: t },
      ],
      attempts: [{ user_id: "u", lesson_id: "q", score: 90, passed: true, created_at: t }],
      certificates: [{ user_id: "u" }],
      profiles: [],
    });
    expect(r.learners[0]!.status).toBe("Completed");
    expect(r.totals.completionRate).toBe(100);
    expect(r.totals.certificates).toBe(1);
  });
  it("flags a learner who failed a quiz and never passed it as Needs help", () => {
    const r = summariseRoster({
      lessons,
      progress: [{ user_id: "u", lesson_id: "a", completed: true, updated_at: t }],
      attempts: [{ user_id: "u", lesson_id: "q", score: 40, passed: false, created_at: t }],
      certificates: [],
      profiles: [],
    });
    expect(r.learners[0]!.status).toBe("Needs help");
    expect(r.learners[0]!.percent).toBe(50);
    expect(r.totals.passRate).toBe(0);
  });
  it("does not flag a learner who failed then passed", () => {
    const r = summariseRoster({
      lessons,
      progress: [],
      attempts: [
        { user_id: "u", lesson_id: "q", score: 40, passed: false, created_at: t },
        { user_id: "u", lesson_id: "q", score: 80, passed: true, created_at: t },
      ],
      certificates: [],
      profiles: [],
    });
    expect(r.learners[0]!.status).toBe("In progress");
    expect(r.learners[0]!.avgScore).toBe(80);
  });
});

describe("summarisePlatform", () => {
  const courses = [
    { id: "c1", title: "Beekeeping", published: true },
    { id: "c2", title: "Soil health", published: false },
  ];
  it("rolls up learners, completion and scores per course and across the platform", () => {
    const r = summarisePlatform({
      courses,
      progress: [
        { course_id: "c1", user_id: "u1", completed: true },
        { course_id: "c1", user_id: "u2", completed: false },
      ],
      attempts: [{ course_id: "c1", user_id: "u1", score: 80, passed: true }],
      certificates: [{ user_id: "u1" }],
      scormAttempts: [
        { lesson_status: "completed", score_raw: 9, score_max: 10 },
        { lesson_status: "incomplete", score_raw: null, score_max: null },
      ],
    });
    expect(r.totals.courses).toBe(2);
    expect(r.totals.publishedCourses).toBe(1);
    expect(r.totals.learners).toBe(2);
    expect(r.totals.certificates).toBe(1);
    expect(r.totals.scormCompletionRate).toBe(50);
    expect(r.totals.scormAvgScore).toBe(90);
    const beekeeping = r.courses.find((c) => c.id === "c1")!;
    expect(beekeeping.learners).toBe(2);
    expect(beekeeping.completionRate).toBe(50);
    expect(beekeeping.avgScore).toBe(80);
    expect(r.courses.find((c) => c.id === "c2")!.learners).toBe(0);
  });
});
