import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

type Ctx = { supabase: any; userId: string };

async function assertAdmin(ctx: Ctx) {
  const { data } = await ctx.supabase.rpc("has_role", { _user_id: ctx.userId, _role: "admin" });
  if (!data) throw new Error("Only administrators can manage the Moodle connection.");
}
async function log(action: string, ok: boolean, message: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  await supabaseAdmin.from("moodle_sync_log").insert({ action, ok, message: message.slice(0, 500) });
}

export const getMyAdminState = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data } = await context.supabase.rpc("has_role", { _user_id: context.userId, _role: "admin" });
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { count } = await supabaseAdmin.from("user_roles").select("id", { count: "exact", head: true }).eq("role", "admin");
    return { isAdmin: !!data, adminExists: (count ?? 0) > 0, tokenConfigured: !!process.env["MOODLE_TOKEN"] };
  });

/** Bootstrap: the first signed-in user may claim admin only while no admin exists. */
export const claimFirstAdmin = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { count } = await supabaseAdmin.from("user_roles").select("id", { count: "exact", head: true }).eq("role", "admin");
    if ((count ?? 0) > 0) throw new Error("An administrator already exists.");
    const { error } = await supabaseAdmin.from("user_roles").insert({ user_id: context.userId, role: "admin" });
    if (error) throw new Error("Could not assign admin role.");
    return { ok: true };
  });

export const saveMoodleSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ baseUrl: z.string().trim().max(300).regex(/^(https:\/\/[^\s]+)?$/, "URL must start with https://"), enabled: z.boolean() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { error } = await context.supabase.from("moodle_settings").update({ base_url: data.baseUrl.replace(/\/+$/, ""), enabled: data.enabled, updated_at: new Date().toISOString() }).eq("id", 1);
    if (error) throw new Error("Could not save settings.");
    return { ok: true };
  });

export const testMoodleConnection = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context);
    const { callMoodle } = await import("./moodle.server");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: s } = await supabaseAdmin.from("moodle_settings").select("base_url").eq("id", 1).single();
    const now = new Date().toISOString();
    try {
      const info = await callMoodle<{ sitename: string }>(s?.base_url ?? "", "core_webservice_get_site_info");
      await supabaseAdmin.from("moodle_settings").update({ status: "connected", site_name: info.sitename, last_tested_at: now, last_error: null }).eq("id", 1);
      await log("test", true, `Connected to ${info.sitename}`);
      return { ok: true, message: `Connected to ${info.sitename}` };
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Connection failed";
      await supabaseAdmin.from("moodle_settings").update({ status: "error", last_tested_at: now, last_error: msg }).eq("id", 1);
      await log("test", false, msg);
      return { ok: false, message: msg };
    }
  });

type MCourse = { id: number; fullname: string; summary?: string; categoryid?: number; visible?: number; overviewfiles?: { fileurl: string }[] };

export const syncMoodleCatalogue = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context);
    const { callMoodle } = await import("./moodle.server");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: s } = await supabaseAdmin.from("moodle_settings").select("base_url, enabled").eq("id", 1).single();
    if (!s?.enabled) return { ok: false, message: "Turn the integration on before syncing." };
    try {
      const [cats, res] = await Promise.all([
        callMoodle<{ id: number; name: string }[]>(s.base_url, "core_course_get_categories"),
        callMoodle<{ courses: MCourse[] }>(s.base_url, "core_course_search_courses", { criterianame: "search", criteriavalue: "" }).catch(() => null),
      ]);
      const list: MCourse[] = res?.courses ?? (await callMoodle<MCourse[]>(s.base_url, "core_course_get_courses"));
      const catName = new Map(cats.map((c) => [c.id, c.name]));
      const now = new Date().toISOString();
      const rows = list.filter((c) => c.id !== 1).map((c) => ({
        moodle_id: c.id, title: c.fullname, summary: (c.summary ?? "").replace(/<[^>]+>/g, "").slice(0, 2000),
        category: catName.get(c.categoryid ?? -1) ?? "", image_url: c.overviewfiles?.[0]?.fileurl ?? null, visible: c.visible !== 0, synced_at: now,
      }));
      if (rows.length) await supabaseAdmin.from("moodle_courses").upsert(rows);
      await supabaseAdmin.from("moodle_settings").update({ last_sync_at: now, status: "connected", last_error: null }).eq("id", 1);
      await log("sync", true, `Synced ${rows.length} courses`);
      return { ok: true, message: `Synced ${rows.length} courses` };
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Sync failed";
      await supabaseAdmin.from("moodle_settings").update({ status: "error", last_error: msg }).eq("id", 1);
      await log("sync", false, msg);
      return { ok: false, message: msg };
    }
  });
