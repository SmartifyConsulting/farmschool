export function extendedDeadline(
  base: string | null,
  extension: string | null | undefined,
): string | null {
  if (base === null) return null;
  return extension && Date.parse(extension) > Date.parse(base) ? extension : base;
}
