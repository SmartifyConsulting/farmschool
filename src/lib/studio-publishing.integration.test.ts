import { describe, expect, it } from "vitest";

const session = process.env["LOVABLE_BROWSER_SUPABASE_SESSION_JSON"];
const url = process.env["VITE_SUPABASE_URL"];
const key = process.env["VITE_SUPABASE_PUBLISHABLE_KEY"];
const suite = session && url && key ? describe : describe.skip;

suite("Studio publishing safeguards", () => {
  it("lets an admin owner review all imports and publish without creator approval while retaining draft locks", async () => {
    if (!session || !url || !key) throw new Error("Signed-in test session required");
    const { access_token: token, user } = JSON.parse(session);
    const request = async (path: string, body?: unknown, method = "POST") => {
      const response = await fetch(`${url}/rest/v1/${path}`, {
        method, headers: { apikey: key, Authorization: `Bearer ${token}`, "Content-Type": "application/json", Prefer: "return=representation" },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
      const text = await response.text();
      const result = text ? JSON.parse(text) : null;
      return { ok: response.ok, result };
    };
    const admin = await request("rpc/has_role", { _user_id: user.id, _role: "admin" });
    expect(admin.result).toBe(true);
    const application = await request(`creator_applications?user_id=eq.${user.id}&select=status`, undefined, "GET");
    expect(application.result.some((row: { status: string }) => row.status === "approved")).toBe(false);
    const created = await request("studio_courses", { author_id: user.id, title: "Publishing verification fixture", description: "Verified farming training with practical lessons and source evidence.", category: "Farm Management" });
    expect(created.ok).toBe(true);
    const id = created.result[0].id;
    try {
      const lessons = await request("studio_lessons", [
        { course_id: id, title: "Water planning", kind: "reading", position: 0, body: "Plan water use.\n\nReview required before publishing." },
        { course_id: id, title: "Wetland care", kind: "reading", position: 1, body: "Protect wetlands.\n\nReview required before publishing." },
      ]);
      expect(lessons.ok).toBe(true);
      expect((await request("rpc/studio_approve_review", { _course_id: id })).ok).toBe(false);
      const reviewed = await request("rpc/studio_mark_imported_reviewed", { _course_id: id });
      expect(reviewed.result).toBe(2);
      const bodies = await request(`studio_lessons?course_id=eq.${id}&select=body&order=position`, undefined, "GET");
      expect(bodies.result.map((row: { body: string }) => row.body.trim())).toEqual(["Plan water use.", "Protect wetlands."]);
      expect((await request("rpc/studio_approve_review", { _course_id: id })).ok).toBe(true);
      expect((await request("rpc/studio_publish_version", { _course_id: id, _note: "Verification" })).ok).toBe(true);
      const live = await request(`studio_courses?id=eq.${id}&select=published`, undefined, "GET");
      expect(live.result[0].published).toBe(true);
      expect((await request("rpc/studio_mark_imported_reviewed", { _course_id: id })).ok).toBe(false);
    } finally {
      await request(`studio_courses?id=eq.${id}`, { published: false }, "PATCH");
      await request("rpc/studio_delete_draft", { _course_id: id });
    }
  }, 30000);
});