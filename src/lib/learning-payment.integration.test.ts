import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import postgres from "postgres";

const databaseUrl = process.env["STUDIO_TEST_DATABASE_URL"];
const suite = databaseUrl ? describe : describe.skip;
type Action = "paid" | "refunded" | "dispute_open" | "dispute_won" | "dispute_lost";

suite("transactional learning payment state", () => {
  async function fixture(check: (apply: (action: Action, created: number, sessionId?: string, eventId?: string, purchased?: number) => Promise<string>, status: () => Promise<string>) => Promise<void>) {
    if (!databaseUrl) throw new Error("An isolated test database is required");
    const sql = postgres(databaseUrl, { max: 1, ssl: "require" });
    const rollback = new Error("ROLLBACK_PAYMENT_FIXTURE");
    try {
      await sql.begin(async (transaction) => {
        const tx = transaction as unknown as ReturnType<typeof postgres>;
        const [owner] = await tx`select user_id as id from public.user_roles where role='admin' limit 1`;
        if (!owner) throw new Error("A test administrator is required");
        await tx`select set_config('request.jwt.claim.sub', ${owner["id"]}, true)`;
        const [course] = await tx`insert into public.studio_courses(author_id,title,description,price_cents,currency) values(${owner["id"]},'Payment test fixture','Rolled back payment verification',2000,'usd') returning id`;
        if (!course) throw new Error("A test course is required");
        const learner = randomUUID();
        const apply = async (action: Action, created: number, sessionId = "cs_initial", eventId: string = randomUUID(), purchased = 100) => {
          const event = {
            id: eventId, type: "test.payment", created, action,
            session: { id: sessionId, created: purchased, mode: "payment", payment_status: "paid", amount_total: 2000, currency: "usd", metadata: { course_id: course["id"], user_id: learner } },
          };
          const [result] = await tx`select public.apply_learning_payment_event(${tx.json(event)}) as result`;
          return String(result?.["result"]);
        };
        const status = async () => {
          const [result] = await tx`select payment_status from public.course_enrollments where user_id=${learner} and course_id=${course["id"]}`;
          return String(result?.["payment_status"]);
        };
        await check(apply, status);
        throw rollback;
      });
    } catch (error) { if (error !== rollback) throw error; }
    finally { await sql.end(); }
  }

  it("processes duplicate deliveries once", async () => fixture(async (apply, status) => {
    const id = randomUUID();
    expect(await apply("paid", 110, "cs_initial", id)).toBe("paid");
    expect(await apply("paid", 110, "cs_initial", id)).toBe("duplicate");
    expect(await status()).toBe("paid");
  }));
  it("keeps a refund effective even when checkout arrives afterwards", async () => fixture(async (apply, status) => {
    await apply("refunded", 130);
    await apply("paid", 110);
    expect(await status()).toBe("refunded");
  }));
  it("preserves a won dispute when an older opened event arrives late", async () => fixture(async (apply, status) => {
    await apply("dispute_won", 150);
    await apply("dispute_open", 140);
    expect(await status()).toBe("paid");
  }));
  it("keeps closed disputes ahead of opened events in the same second", async () => fixture(async (apply, status) => {
    await apply("dispute_won", 150);
    await apply("dispute_open", 150);
    expect(await status()).toBe("paid");
  }));
  it("does not let a checkout event restore disputed access", async () => fixture(async (apply, status) => {
    await apply("dispute_lost", 150);
    await apply("paid", 160);
    expect(await status()).toBe("disputed");
  }));
  it("does not let an old refund revoke a later repurchase", async () => fixture(async (apply, status) => {
    await apply("paid", 110);
    await apply("refunded", 130);
    await apply("paid", 220, "cs_repurchase", randomUUID(), 200);
    await apply("refunded", 230);
    expect(await status()).toBe("paid");
  }));
});
