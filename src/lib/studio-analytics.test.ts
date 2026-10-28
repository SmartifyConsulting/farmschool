import { describe, it, expect } from "vitest";
import { summariseRoster } from "./studio-analytics";

const lessons = [{ id: "a", title: "A", kind: "reading" }, { id: "q", title: "Q", kind: "quiz" }];
const t = "2026-10-28T00:00:00Z";

describe("summariseRoster", () => {
  it("marks a learner who finished every lesson as Completed", () => {
    const r = summariseRoster({ lessons, progress: [{ user_id: "u", lesson_id: "a", completed: true, updated_at: t }, { user_id: "u", lesson_id: "q", completed: true, updated_at: t }], attempts: [{ user_id: "u", lesson_id: "q", score: 90, passed: true, created_at: t }], certificates: [{ user_id: "u" }], profiles: [] });
    expect(r.learners[0].status).toBe("Completed");
    expect(r.totals.completionRate).toBe(100);
    expect(r.totals.certificates).toBe(1);
  });
  it("flags a learner who failed a quiz and never passed it as Needs help", () => {
    const r = summariseRoster({ lessons, progress: [{ user_id: "u", lesson_id: "a", completed: true, updated_at: t }], attempts: [{ user_id: "u", lesson_id: "q", score: 40, passed: false, created_at: t }], certificates: [], profiles: [] });
    expect(r.learners[0].status).toBe("Needs help");
    expect(r.learners[0].percent).toBe(50);
    expect(r.totals.passRate).toBe(0);
  });
  it("does not flag a learner who failed then passed", () => {
    const r = summariseRoster({ lessons, progress: [], attempts: [{ user_id: "u", lesson_id: "q", score: 40, passed: false, created_at: t }, { user_id: "u", lesson_id: "q", score: 80, passed: true, created_at: t }], certificates: [], profiles: [] });
    expect(r.learners[0].status).toBe("In progress");
    expect(r.learners[0].avgScore).toBe(80);
  });
});
