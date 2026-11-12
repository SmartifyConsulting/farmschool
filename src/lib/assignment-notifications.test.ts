import { describe, expect, it } from "vitest";
import { assignmentNotifications, type AssignmentNoticeInput } from "./assignment-notifications";

const now = Date.parse("2026-11-12T10:00:00Z");
const assignment: AssignmentNoticeInput = {
  cohortId: "team",
  cohortName: "Farm team",
  courseId: "course",
  courseTitle: "Training",
  assignedAt: "2026-11-01T00:00:00Z",
  dueAt: null,
};
const build = (items: AssignmentNoticeInput[], read = new Set<string>(), time = now) =>
  assignmentNotifications(items, new Set(), read, time);

describe("assignment reminders", () => {
  it("only reminds about courses that are not certified", () => {
    expect(assignmentNotifications([assignment], new Set(["course"]), new Set(), now)).toEqual([]);
  });
  it("orders overdue, upcoming and undated assignments", () => {
    const notes = build([
      assignment,
      { ...assignment, courseId: "upcoming", dueAt: "2026-11-15T12:00:00Z" },
      { ...assignment, courseId: "late", dueAt: "2026-11-11T12:00:00Z" },
    ]);
    expect(notes.map((note) => note.kind)).toEqual(["overdue", "due-soon", "assigned"]);
  });
  it("creates a fresh unread reminder when a read assignment becomes overdue", () => {
    const items = [{ ...assignment, dueAt: "2026-11-13T10:00:00Z" }];
    const note = build(items)[0]!;
    const reads = new Set([note.key]);
    expect(build(items, reads)[0]?.read).toBe(true);
    expect(build(items, reads, now + 2 * 86400000)[0]).toMatchObject({
      kind: "overdue",
      read: false,
    });
  });
  it("treats a changed deadline as a new reminder", () => {
    const key = build([assignment])[0]!.key;
    expect(build([{ ...assignment, dueAt: "2026-11-18T12:00:00Z" }], new Set([key]))[0]?.read).toBe(
      false,
    );
  });
  it("keeps different cohort assignments separate", () => {
    expect(
      new Set(build([assignment, { ...assignment, cohortId: "other" }]).map((note) => note.key))
        .size,
    ).toBe(2);
  });
});
