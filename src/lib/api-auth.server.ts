import { createHash } from "crypto";

const json = (body: unknown, status = 200, extra: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", "cache-control": "no-store", ...extra } });

export type Scope = "courses:read" | "progress:read";

/** Verifies a learner API key (not revoked, has scope, under daily limit); returns owner id or an error Response. */
export async function verifyApiKey(request: Request, scope: Scope): Promise<{ userId: string } | Response> {
  const key = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "").trim() ?? "";
  if (!/^fp_[a-f0-9]{48}$/.test(key)) return json({ error: "Missing or invalid API key" }, 401);
  const hash = createHash("sha256").update(key).digest("hex");
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: k } = await supabaseAdmin.from("api_keys")
    .select("id, user_id, scopes, daily_limit, usage_count, usage_date, total_requests, revoked_at")
    .eq("key_hash", hash).maybeSingle();
  if (!k || k.revoked_at) return json({ error: "Missing or invalid API key" }, 401);
  if (!k.scopes.includes(scope)) return json({ error: `This key lacks the '${scope}' scope` }, 403);
  const today = new Date().toISOString().slice(0, 10);
  const used = k.usage_date === today ? k.usage_count : 0;
  if (used >= k.daily_limit) return json({ error: "Daily request limit reached" }, 429, { "retry-after": "3600" });
  await supabaseAdmin.from("api_keys").update({
    usage_count: used + 1, usage_date: today, total_requests: k.total_requests + 1, last_used_at: new Date().toISOString(),
  }).eq("id", k.id);
  return { userId: k.user_id };
}

export { json };
