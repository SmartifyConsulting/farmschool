import { beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("@tanstack/react-start", () => ({
  createServerFn: () => {
    let validate = (value: unknown) => value;
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
import { progressLibraryCourse } from "./library-course.functions";
const id = "10000000-0000-4000-8000-000000000001";
let replies: { data: unknown; error?: unknown }[];
let rpc: ReturnType<typeof vi.fn>;
const base = () => ({
  id,
  author_id: "owner",
  title: "Training",
  description: "A complete training description for learners.",
  category: "Education / Training",
  published: false,
  library_scope: "admin",
  studio_lessons: [{ count: 3 }],
  studio_review_approvals: [{ reviewer_id: "owner" }],
});
const invoke = (action = "publish") => {
  const b = {
    select: () => b,
    eq: () => b,
    is: () => b,
    single: async () => replies.shift(),
    maybeSingle: async () => replies.shift(),
  };
  return (progressLibraryCourse as unknown as (input: unknown) => Promise<unknown>)({
    data: { courseId: id, action },
    context: { userId: "owner", supabase: { from: () => b, rpc } },
  });
};
beforeEach(() => {
  replies = [];
  rpc = vi
    .fn()
    .mockImplementation(async (name: string) => ({
      data: name === "has_role" ? true : id,
      error: null,
    }));
});
describe("Library completion and public publishing", () => {
  it("publishes reviewed public courses only through the existing version publisher", async () => {
    replies.push({ data: base() }, { data: null });
    await expect(invoke()).resolves.toEqual({ id, action: "publish" });
    expect(rpc).toHaveBeenCalledWith("studio_publish_version", {
      _course_id: id,
      _note: "Published from Completed Library",
    });
    expect(rpc).not.toHaveBeenCalledWith("studio_approve_review", expect.anything());
  });
  it("does not silently expose a private organisation course", async () => {
    replies.push({ data: base() }, { data: { organization_id: "private" } });
    await expect(invoke()).rejects.toThrow("private");
    expect(rpc.mock.calls.some(([name]) => name === "studio_publish_version")).toBe(false);
  });
  it("requires review and never treats a lesson count as completion", async () => {
    replies.push({ data: { ...base(), studio_review_approvals: [] } });
    await expect(invoke()).rejects.toThrow("Review this course");
    expect(rpc.mock.calls.some(([name]) => name === "studio_publish_version")).toBe(false);
  });
  it("records explicit completion without publishing and retains the server review guard", async () => {
    replies.push({ data: base() });
    await expect(invoke("complete")).resolves.toEqual({ id, action: "complete" });
    expect(rpc.mock.calls.some(([name]) => name === "studio_publish_version")).toBe(false);
    replies.push({ data: base() });
    rpc
      .mockResolvedValueOnce({ data: true, error: null })
      .mockResolvedValueOnce({ data: null, error: "Missing quiz keys" });
    await expect(invoke("complete")).rejects.toThrow("quiz answer keys");
  });
  it("rejects missing ownership, non-admin access and empty imports", async () => {
    replies.push({ data: null });
    await expect(invoke()).rejects.toThrow("owner");
    replies.push({ data: base() });
    rpc.mockResolvedValueOnce({ data: false, error: null });
    await expect(invoke()).rejects.toThrow("Admin access");
    replies.push({ data: { ...base(), studio_lessons: [{ count: 0 }] } });
    await expect(invoke()).rejects.toThrow("details");
  });
});
