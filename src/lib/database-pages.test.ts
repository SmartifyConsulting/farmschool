import { describe, expect, it, vi } from "vitest";
import { readAllPages } from "./database-pages";

describe("complete reporting inputs", () => {
  it("keeps reading when the server cap is smaller than the requested page", async () => {
    const records = Array.from({ length: 1201 }, (_, index) => ({ id: index }));
    const range = vi.fn(async (from: number) => ({ data: records.slice(from, from + 200), count: records.length, error: null }));
    expect(await readAllPages({ range })).toEqual({ data: records });
    expect(range).toHaveBeenCalledTimes(7);
  });

  it.each([
    { data: [], count: null, error: null },
    { data: null, count: 0, error: null },
    { data: [], count: 0, error: { message: "Denied" } },
    { data: [], count: 2, error: null },
  ])("rejects unavailable or incomplete records: %j", async (page) => {
    await expect(readAllPages({ range: async () => page })).rejects.toThrow();
  });

  it("accepts an empty dataset", async () => {
    expect(await readAllPages({ range: async () => ({ data: [], count: 0, error: null }) })).toEqual({ data: [] });
  });
});
