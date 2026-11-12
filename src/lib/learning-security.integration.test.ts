import { describe, expect, it } from "vitest";
import postgres from "postgres";

const databaseUrl = process.env["STUDIO_TEST_DATABASE_URL"];
const suite = databaseUrl ? describe : describe.skip;

suite("learning database security", () => {
  it.each(["quiz_attempts", "certificates", "lesson_photo_submissions"])(
    "prevents learners from directly changing %s", async (table) => {
      if (!databaseUrl) throw new Error("An isolated test database is required");
      const sql = postgres(databaseUrl, { max: 1, ssl: "require" });
      try {
        const rows = await sql`
          select privilege, has_table_privilege('authenticated', ${"public." + table}, privilege) as allowed
          from unnest(array['INSERT','UPDATE','DELETE','TRUNCATE']) as privilege
        `;
        expect(rows.every((row) => row["allowed"] === false)).toBe(true);
        const tables = await sql`
          select relrowsecurity from pg_class
          where oid = ${"public." + table}::regclass
        `;
        expect(tables[0]?.["relrowsecurity"]).toBe(true);
      } finally {
        await sql.end();
      }
    },
  );
});
