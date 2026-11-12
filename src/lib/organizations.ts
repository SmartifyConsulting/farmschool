export function departmentPath(
  id: string,
  departments: { id: string; name: string; parent_id: string | null }[],
) {
  const seen = new Set<string>();
  const names: string[] = [];
  let current: string | null = id;
  while (current && names.length < 32) {
    if (seen.has(current)) return "Hierarchy needs review";
    seen.add(current);
    const department = departments.find((d) => d.id === current);
    if (!department) return "Department unavailable";
    names.unshift(department.name);
    current = department.parent_id;
  }
  return current ? "Hierarchy needs review" : names.join(" / ");
}
