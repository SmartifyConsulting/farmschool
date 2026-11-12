import { expect, it } from "vitest";
import { examDraftAnswers, examPolicySettings, remainingExamSeconds } from "./exam-controls";
it("calculates remaining time from server time and elapsed time", () => {
  expect(remainingExamSeconds("2026-11-12T18:01:00Z", "2026-11-12T18:00:00Z", 15000)).toBe(45);
  expect(remainingExamSeconds("2026-11-12T18:01:00Z", "2026-11-12T18:00:00Z", 90000)).toBe(0);
  expect(remainingExamSeconds("invalid", "invalid", 0)).toBe(0);
});
it("accepts unfinished answers but bounds their size and shape", () => {
  expect(examDraftAnswers.parse([null, "-", [-1, 1], []])).toEqual([null, "-", [-1, 1], []]);
  expect(examDraftAnswers.safeParse([{ answer: true }]).success).toBe(false);
  expect(examDraftAnswers.safeParse(["x".repeat(2001)]).success).toBe(false);
  expect(
    examPolicySettings.safeParse({ maxAttempts: 2, durationMinutes: 0, startSpacingMinutes: 0 })
      .success,
  ).toBe(false);
});
