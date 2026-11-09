import { describe, expect, it } from "vitest";
import postgres from "postgres";

// Requires an explicitly supplied test database with authenticated role access.
// The sandbox's read-oriented connection cannot exercise signed-in RPC grants.
const databaseUrl = process.env["STUDIO_TEST_DATABASE_URL"];
const suite = databaseUrl ? describe : describe.skip;
suite("Studio revision database rules", () => {
  async function fixture(check: (sql: ReturnType<typeof postgres>, courseId: string, ownerId: string, lessonId: string) => Promise<void>) {
    if (!databaseUrl) throw new Error("Integration database is required");
    const sql = postgres(databaseUrl, { max: 1, ssl: "require" });
    const rollback = new Error("ROLLBACK_TEST_FIXTURE");
    try {
      await sql.begin(async transaction => {
        const tx = transaction as unknown as ReturnType<typeof postgres>;
        const [owner] = await tx`select user_id as id from public.user_roles where role='admin' limit 1`;
        if (!owner) throw new Error("Expected database row");
        if (!owner) throw new Error("A test owner is required");
        await tx`select set_config('request.jwt.claim.sub', ${owner["id"]}, true)`;
        await tx`select public.creator_submit_application('Temporary test','Verified agricultural training expertise','Agriculture')`;
        await tx`select public.creator_review_application(${owner["id"]},true,'Temporary rolled-back verification')`;
        const [course] = await tx`insert into public.studio_courses(author_id,title,description) values(${owner["id"]},'Transactional studio fixture','Verified training for safe seasonal farming practices.') returning id`;
        if (!course) throw new Error("Expected database row");
        const [lesson] = await tx`insert into public.studio_lessons(course_id,title,kind,body) values(${course["id"]},'Practical lesson','reading','Original verified notes.') returning id`;
        if (!lesson) throw new Error("Expected database row");
        await check(tx, course["id"], owner["id"], lesson["id"]);
        throw rollback;
      });
    } catch (error) { if (error !== rollback) throw error; }
    finally { await sql.end(); }
  }
  it("duplicates lessons as an unpublished independent course", async () => fixture(async (sql, id) => {
    const [copy] = await sql`select public.studio_copy_draft(${id},false) as id`;
        if (!copy) throw new Error("Expected database row");
    const [row] = await sql`select published,revision_of,(select count(*)::int from studio_lessons where course_id=c.id) as lessons from studio_courses c where id=${copy["id"]}`;
        if (!row) throw new Error("Expected database row");
    expect(row["published"]).toBe(false); expect(row["revision_of"]).toBe(null); expect(row["lessons"]).toBe(1); expect(copy["id"]).not.toBe(id);
  }));
  it("keeps live content unchanged while one reusable revision is edited", async () => fixture(async (sql, id, _owner, lessonId) => {
    await sql`select public.studio_approve_review(${id})`; await sql`select public.studio_publish_version(${id},'Initial')`;
    const [a] = await sql`select public.studio_copy_draft(${id},true) as id`;
        if (!a) throw new Error("Expected database row");
    const [b] = await sql`select public.studio_copy_draft(${id},true) as id`;
        if (!b) throw new Error("Expected database row");
    expect(a["id"]).toBe(b["id"]);
    await sql`update studio_lessons set body='Revised notes' where course_id=${a["id"]}`;
    const [live] = await sql`select body from studio_lessons where id=${lessonId}`;
        if (!live) throw new Error("Expected database row");
    expect(live["body"]).toBe('Original verified notes.');
  }));
  it("publishes revisions atomically with stable lesson IDs and two snapshots", async () => fixture(async (sql, id, _owner, lessonId) => {
    await sql`select public.studio_approve_review(${id})`; await sql`select public.studio_publish_version(${id},'Initial')`;
    const [draft] = await sql`select public.studio_copy_draft(${id},true) as id`;
        if (!draft) throw new Error("Expected database row");
    await sql`update studio_lessons set body='Revised notes' where course_id=${draft["id"]}`;
    await sql`select public.studio_approve_review(${draft["id"]})`;
    const [result] = await sql`select public.studio_publish_version(${draft["id"]},'Revised') as id`;
        if (!result) throw new Error("Expected database row");
    expect(result["id"]).toBe(id);
    const [lesson] = await sql`select body from studio_lessons where id=${lessonId}`;
        if (!lesson) throw new Error("Expected database row");
    expect(lesson["body"]).toBe('Revised notes');
    const versions = await sql`select version_number from studio_course_versions where course_id=${id} order by version_number`;
    expect(versions.map(v => v["version_number"])).toEqual([1,2]);
    expect((await sql`select id from studio_courses where id=${draft["id"]}`).length).toBe(0);
  }));
  it("refuses deletion of published courses", async () => fixture(async (sql,id) => {
    await sql`select public.studio_approve_review(${id})`; await sql`select public.studio_publish_version(${id},'Initial')`;
    const [result] = await sql`select public.studio_delete_draft(${id}) as result`;
        if (!result) throw new Error("Expected database row");
    expect(result["result"]).toBe('published');
  }));
  it("rejects copies requested by a different trainer", async () => fixture(async (sql,id) => {
    await sql`select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000001',true)`;
    await expect(sql`select public.studio_copy_draft(${id},false)`).rejects.toThrow('Only the owner');
  }));
  it("rejects publishing without creator approval", async () => fixture(async (sql,id,owner) => {
    await sql`update public.creator_applications set status='rejected' where user_id=${owner}`;
    await sql`delete from public.user_roles where user_id=${owner} and role='admin'`;
    await sql`select public.studio_approve_review(${id})`;
    await expect(sql`select public.studio_publish_version(${id},'Initial')`).rejects.toThrow('Creator approval');
  }));
  it("reorders lessons as a single operation", async () => fixture(async (sql,id,_owner,lessonId) => {
    const [second] = await sql`insert into studio_lessons(course_id,title,kind,position) values(${id},'Second lesson','reading',1) returning id`;
        if (!second) throw new Error("Expected database row");
    await sql`select public.studio_move_lesson(${id},${second["id"]},-1)`;
    const ordered = await sql`select id from studio_lessons where course_id=${id} order by position`;
    expect(ordered.map(row => row["id"])).toEqual([second["id"],lessonId]);
  }));
});