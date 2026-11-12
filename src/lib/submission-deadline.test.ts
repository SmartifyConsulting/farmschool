import { describe, expect, it } from "vitest";
import { submissionDeadline } from "./submission-deadline";

const due = "2026-11-12T15:00:00+02:00";
describe("submission deadlines", () => {
  it("uses the same instant for SAST and UTC deadlines", () => {
    expect(submissionDeadline(due, false, Date.parse("2026-11-12T13:00:01Z"))).toEqual({
      late: true,
      blocked: true,
    });
  });
  it("permits work at the exact deadline", () => {
    expect(submissionDeadline(due, false, Date.parse(due))).toEqual({
      late: false,
      blocked: false,
    });
  });
  it("labels accepted late work without blocking it", () => {
    expect(submissionDeadline(due, true, Date.parse(due) + 1)).toEqual({
      late: true,
      blocked: false,
    });
  });
  it("does not invent a deadline for undated assignments", () => {
    expect(submissionDeadline(null, false, Date.now())).toEqual({ late: false, blocked: false });
  });
});
