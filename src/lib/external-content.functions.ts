import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { canonicalKey, normaliseCategory, officialEmbed, parseDuration, videoRow, youtubeId } from "@/lib/external-content";

type Ctx = { supabase: any; userId: string };
async function assertAdmin(ctx: Ctx) {
  const { data } = await ctx.supabase.rpc("has_role", { _user_id: ctx.userId, _role: "admin" });
  if (!data) throw new Error("Only administrators can manage the video library.");
}

async function youtubeInfo(url: string): Promise<{ title?: string; thumb?: string } | null> {
  if (!youtubeId(url)) return null;
  try {
    const r = await fetch(`https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(url)}`, { signal: AbortSignal.timeout(6000) });
    if (!r.ok) return { title: undefined };
    const j = (await r.json()) as { title?: string; thumbnail_url?: string };
    return { title: j.title, thumb: j.thumbnail_url };
  } catch { return null; }
}

export const importVideos = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({
    providerId: z.string().uuid(),
    method: z.enum(["manual", "csv"]),
    updateExisting: z.boolean().default(false),
    rows: z.array(z.record(z.string(), z.string())).min(1).max(500),
  }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { data: provider } = await context.supabase.from("external_content_providers").select("id, enabled").eq("id", data.providerId).maybeSingle();
    if (!provider) throw new Error("That provider wasn't found.");
    if (!provider.enabled) throw new Error("This provider is switched off. Turn it on first.");
    let created = 0, updated = 0, duplicates = 0;
    const errors: { row: number; message: string }[] = [];
    const seen = new Set<string>();
    for (const [i, raw] of data.rows.entries()) {
      const parsed = videoRow.safeParse(raw);
      if (!parsed.success) { errors.push({ row: i + 1, message: parsed.error.issues[0]?.message ?? "Invalid row" }); continue; }
      const v = parsed.data;
      let key: string;
      try { key = canonicalKey(v.url); } catch { errors.push({ row: i + 1, message: "Link is not a valid web address" }); continue; }
      if (seen.has(key)) { duplicates++; continue; }
      seen.add(key);
      const { data: existing } = await context.supabase.from("external_content_items").select("id").eq("canonical_key", key).maybeSingle();
      if (existing && !data.updateExisting) { duplicates++; continue; }
      const yt = !v.title || !v.thumbnail ? await youtubeInfo(v.url) : null;
      const title = v.title || yt?.title || "";
      if (title.length < 2) { errors.push({ row: i + 1, message: "Add a title for this video" }); continue; }
      const thumb = /^https:\/\//.test(v.thumbnail) ? v.thumbnail : yt?.thumb ?? null;
      const record = {
        provider_id: data.providerId, title, description: v.description, thumbnail_url: thumb,
        category: normaliseCategory(v.category), language: v.language || "English",
        original_url: v.url, canonical_key: key, embed_url: officialEmbed(v.url),
        duration_seconds: parseDuration(v.duration), published_on: /^\d{4}-\d{2}-\d{2}$/.test(v.published) ? v.published : null,
        last_synced_at: new Date().toISOString(), import_status: "active",
      };
      if (existing) {
        // Update metadata only — course links point at the same id and stay intact.
        const { error } = await context.supabase.from("external_content_items").update(record).eq("id", existing.id);
        if (error) errors.push({ row: i + 1, message: "Could not update this video" }); else updated++;
      } else {
        const { error } = await context.supabase.from("external_content_items").insert(record);
        if (error) errors.push({ row: i + 1, message: error.code === "23505" ? "Already in the library" : "Could not save this video" }); else created++;
      }
    }
    await context.supabase.from("external_content_imports").insert({
      provider_id: data.providerId, method: data.method, total: data.rows.length,
      created_count: created, updated_count: updated, duplicate_count: duplicates, error_count: errors.length,
      errors: errors.slice(0, 50), created_by: context.userId,
    });
    return { created, updated, duplicates, errors };
  });

/** Checks each library link is still reachable; marks missing pages "unavailable". */
export const checkVideoLinks = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context);
    const { data: items } = await context.supabase.from("external_content_items").select("id, original_url, provider_id").limit(200);
    let ok = 0, broken = 0;
    const errors: { row: number; message: string }[] = [];
    for (const [i, it] of (items ?? []).entries()) {
      let status = "active";
      try {
        const yt = youtubeId(it.original_url);
        const target = yt ? `https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(it.original_url)}` : it.original_url;
        const r = await fetch(target, { method: "GET", redirect: "follow", signal: AbortSignal.timeout(8000) });
        if (r.status === 404 || r.status === 410 || (yt && (r.status === 401 || r.status === 403))) status = "unavailable";
      } catch { status = "unavailable"; }
      if (status === "unavailable") { broken++; errors.push({ row: i + 1, message: it.original_url }); } else ok++;
      await context.supabase.from("external_content_items").update({ import_status: status, last_synced_at: new Date().toISOString() }).eq("id", it.id);
    }
    await context.supabase.from("external_content_imports").insert({
      method: "link_check", total: (items ?? []).length, updated_count: ok, error_count: broken, errors: errors.slice(0, 50), created_by: context.userId,
    });
    return { ok, broken };
  });
