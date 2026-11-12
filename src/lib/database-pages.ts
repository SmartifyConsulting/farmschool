type Page<Row> = { data: Row[] | null; error: unknown; count: number | null };

export async function readAllPages<Row>(request: {
  range: (from: number, to: number) => PromiseLike<Page<Row>>;
}): Promise<{ data: Row[] }> {
  const rows: Row[] = [];
  while (true) {
    const page = await request.range(rows.length, rows.length + 499);
    if (page.error || page.count === null || page.data === null)
      throw new Error("Could not load complete learning records. Please try again.");
    rows.push(...page.data);
    if (rows.length >= page.count) return { data: rows };
    if (!page.data.length) throw new Error("Learning records changed while loading. Please try again.");
  }
}
