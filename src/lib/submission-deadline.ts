export function submissionDeadline(dueAt: string | null, allowLate: boolean, now: number) {
  const due = dueAt ? Date.parse(dueAt) : NaN;
  const late = Number.isFinite(due) && now > due;
  return { late, blocked: late && !allowLate };
}
