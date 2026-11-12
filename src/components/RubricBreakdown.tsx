import { rubricCriteria } from "@/lib/competency-rubric";

export function RubricBreakdown({
  snapshot,
}: {
  snapshot: {
    criteria_snapshot: unknown;
    marks: unknown;
    total_points: number;
    max_points: number;
    pass_mark: number;
    rubric_version: number;
  } | null;
}) {
  if (!snapshot) return null;
  const parsed = rubricCriteria.safeParse(snapshot.criteria_snapshot);
  if (!parsed.success || !snapshot.marks || typeof snapshot.marks !== "object") return null;
  const marks = snapshot.marks as Record<string, unknown>;
  return (
    <details className="mt-3 text-sm">
      <summary className="cursor-pointer">
        Rubric breakdown · version {snapshot.rubric_version}
      </summary>
      <ul className="mt-2 space-y-2">
        {parsed.data.map((criterion) => (
          <li key={criterion.id} className="rounded-md bg-muted p-2">
            <p className="font-medium">
              {criterion.title} ·{" "}
              {typeof marks[criterion.id] === "number" ? String(marks[criterion.id]) : "—"}/
              {criterion.maxPoints}
            </p>
            {criterion.description && (
              <p className="text-xs text-muted-foreground">{criterion.description}</p>
            )}
          </li>
        ))}
      </ul>
      <p className="mt-2 text-xs text-muted-foreground">
        Total: {snapshot.total_points}/{snapshot.max_points} · Pass mark: {snapshot.pass_mark}%
      </p>
    </details>
  );
}
