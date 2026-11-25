import { beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("@tanstack/react-start", () => ({
  createServerFn: () => {
    let validate = (input: unknown) => input;
    const b = {
      middleware: () => b,
      inputValidator: (v: typeof validate) => {
        validate = v;
        return b;
      },
      handler: (fn: (input: unknown) => unknown) => (input: { data: unknown; context: unknown }) =>
        fn({ ...input, data: validate(input.data) }),
    };
    return b;
  },
}));
vi.mock("@/integrations/supabase/auth-middleware", () => ({ requireSupabaseAuth: {} }));
import { applyCategory, suggestCategoriesWithAI } from "./auto-categorise.functions";
const owner = "10000000-0000-4000-8000-000000000001";
const id = "10000000-0000-4000-8000-000000000002";
const destination = "10000000-0000-4000-8000-000000000003";
const moved = "10000000-0000-4000-8000-000000000004";
type Result = { data: unknown; error?: unknown };
type Operation = { table: string; calls: [string, ...unknown[]][] };
let operations: Operation[];
let replies: Result[];
let rpc: ReturnType<typeof vi.fn>;
const from = (table: string) => {
  const operation: Operation = { table, calls: [] };
  operations.push(operation);
  const next = () =>
    Promise.resolve(replies.shift() ?? { data: null, error: "Unexpected request" });
  const b: Record<string, unknown> = {};
  for (const name of ["select", "eq", "is", "ilike", "in", "insert", "update"])
    b[name] = (...args: unknown[]) => {
      operation.calls.push([name, ...args]);
      return b;
    };
  b["single"] = next;
  b["limit"] = next;
  b["then"] = (resolve: (r: Result) => unknown, reject: (r: unknown) => unknown) =>
    next().then(resolve, reject);
  return b;
};
const invoke = (data: Record<string, unknown> = {}) =>
  (applyCategory as unknown as (input: unknown) => Promise<unknown>)({
    data: { mode: "courses", id, sector: "Financial Services", expectedFolder: null, ...data },
    context: { userId: owner, supabase: { from, rpc } },
  });
const course = (folder_id: string | null = null, published = false) => ({
  data: { id, folder_id, published },
});
const writes = () =>
  operations.flatMap((op) => op.calls.filter(([name]) => name === "insert" || name === "update"));
beforeEach(() => {
  operations = [];
  replies = [];
  rpc = vi.fn();
});
describe("reviewed categorisation writes", () => {
  it("rejects published and unavailable courses before creating folders", async () => {
    replies.push(course(null, true));
    await expect(invoke()).rejects.toThrow("unpublished");
    expect(writes()).toEqual([]);
    expect(operations[0]!.calls).toContainEqual(["eq", "author_id", owner]);
    replies.push({ data: null });
    await expect(invoke()).rejects.toThrow("unpublished");
    expect(writes()).toEqual([]);
  });
  it("reuses an industry folder and changes only the selected owned draft's folder", async () => {
    replies.push(course(), { data: [{ id: destination }] }, { data: { id } });
    await expect(invoke()).resolves.toEqual({ id });
    expect(writes()).toEqual([["update", { folder_id: destination }]]);
    expect(operations[2]!.calls).toContainEqual(["eq", "published", false]);
    expect(operations[2]!.calls).toContainEqual(["eq", "author_id", owner]);
    expect(operations[2]!.calls).toContainEqual(["is", "folder_id", null]);
  });
  it("creates a missing folder and safely recognises a completed retry", async () => {
    replies.push(course(), { data: [] }, { data: { id: destination } }, { data: { id } });
    await invoke();
    expect(writes()[0]).toEqual([
      "insert",
      { author_id: owner, name: "Financial Services", parent_id: null },
    ]);
    const before = writes().length;
    replies.push(course(destination), { data: [{ id: destination }] });
    await expect(invoke()).resolves.toEqual({ id });
    expect(writes()).toHaveLength(before);
  });
  it("rejects a stale course location or duplicate destinations without moving it", async () => {
    replies.push(course(moved), { data: [{ id: destination }] });
    await expect(invoke()).rejects.toThrow("moved since");
    replies.push(course(), { data: [{ id: destination }, { id: moved }] });
    await expect(invoke()).rejects.toThrow("Several folders");
    expect(writes()).toEqual([]);
  });
  it("reports a failed move instead of claiming success", async () => {
    replies.push(course(), { data: [{ id: destination }] }, { data: null, error: "Denied" });
    await expect(invoke()).rejects.toThrow("not moved");
  });
  it("preserves other file metadata and keywords when changing a library sector", async () => {
    replies.push(
      { data: { keywords: ["custom", "sector:Agriculture"], folder_id: moved } },
      { data: { id } },
    );
    await invoke({ mode: "library" });
    expect(writes()).toEqual([["update", { keywords: ["custom", "sector:Financial Services"] }]]);
    expect(operations[1]!.calls).toContainEqual(["eq", "author_id", owner]);
  });
  it("validates categories before querying and rejects unowned AI inputs before quota use", async () => {
    expect(() => invoke({ sector: "invented" })).toThrow();
    expect(operations).toHaveLength(0);
    replies.push({ data: [] });
    await expect(
      (suggestCategoriesWithAI as unknown as (input: unknown) => Promise<unknown>)({
        data: { mode: "library", ids: [id] },
        context: { userId: owner, supabase: { from, rpc } },
      }),
    ).rejects.toThrow("own available");
    expect(rpc).not.toHaveBeenCalled();
  });
});
