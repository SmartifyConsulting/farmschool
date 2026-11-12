export function latestCompetencyEvidence<
  Row extends {
    id: string;
    competency_id: string;
    assessed_at: string | null;
    created_at: string;
  },
>(rows: Row[]): Row[] {
  const seen = new Set<string>();
  return [...rows]
    .sort(
      (first, second) =>
        Date.parse(second.assessed_at ?? second.created_at) -
          Date.parse(first.assessed_at ?? first.created_at) || second.id.localeCompare(first.id),
    )
    .filter((row) => {
      if (seen.has(row.competency_id)) return false;
      seen.add(row.competency_id);
      return true;
    });
}
