export type AssignmentNoticeInput = {
  cohortId: string;
  cohortName: string;
  courseId: string;
  courseTitle: string;
  assignedAt: string;
  dueAt: string | null;
};

export function assignmentNotifications(
  assignments: AssignmentNoticeInput[],
  certified: Set<string>,
  readKeys: Set<string>,
  now: number,
) {
  return assignments
    .filter((assignment) => !certified.has(assignment.courseId))
    .map((assignment) => {
      const due = assignment.dueAt ? Date.parse(assignment.dueAt) : NaN;
      const kind: "overdue" | "due-soon" | "assigned" =
        due < now ? "overdue" : due <= now + 7 * 86400000 ? "due-soon" : "assigned";
      const key = JSON.stringify([
        assignment.cohortId,
        assignment.courseId,
        assignment.assignedAt,
        assignment.dueAt,
        kind,
      ]);
      return { ...assignment, kind, key, read: readKeys.has(key) };
    })
    .sort((first, second) => {
      const priority = { overdue: 0, "due-soon": 1, assigned: 2 };
      return (
        priority[first.kind] - priority[second.kind] ||
        (Date.parse(first.dueAt ?? "") || Infinity) -
          (Date.parse(second.dueAt ?? "") || Infinity) ||
        second.assignedAt.localeCompare(first.assignedAt)
      );
    });
}
