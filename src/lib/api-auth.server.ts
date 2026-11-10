import { createHash } from "crypto";

const json = (body: unknown, status = 200, extra: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", "cache-control": "no-store", ...extra } });

export type Scope = "courses:read" | "progress:read";

/** Verifies a learner API key (not revoked, has scope, under daily limit); returns owner id and the key's category scope (null means every category) or an error Response. */
export async function verifyApiKey(request: Request, scope: Scope): Promise<{ userId: string; categories: string[] | null } | Response> {
  const key = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "").trim() ?? "";
  if (!/^fp_[a-f0-9]{48}$/.test(key)) return json({ error: "Missing or invalid API key" }, 401);
  const hash = createHash("sha256").update(key).digest("hex");
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: row } = await supabaseAdmin.from("api_keys")
    .select("id, user_id, scopes, daily_limit, usage_count, usage_date, total_requests, revoked_at, categories" as never)
    .eq("key_hash", hash).maybeSingle();
  const k = row as unknown as { id: string; user_id: string; scopes: string[]; daily_limit: number; usage_count: number; usage_date: string; total_requests: number; revoked_at: string | null; categories: string[] | null } | null;
  if (!k || k.revoked_at) return json({ error: "Missing or invalid API key" }, 401);
  if (!k.scopes.includes(scope)) return json({ error: `This key lacks the '${scope}' scope` }, 403);
  // Reserve capacity in a single database UPDATE, preventing concurrent
  // requests from racing the daily limit. The RPC also rechecks revocation
  // and scope at the moment the request is reserved.
  const { data: reserved, error: reserveError } = await supabaseAdmin.rpc(
    "reserve_api_key_request",
    { _key_id: k.id, _scope: scope },
  );
  if (reserveError) {
    console.error("API key reservation failed", reserveError);
    return json({ error: "API access temporarily unavailable" }, 503);
  }
  if (reserved !== true) {
    return json({ error: "API key revoked or daily request limit reached" }, 429, { "retry-after": "3600" });
  }
  return { userId: k.user_id, categories: k.categories?.length ? k.categories : null };
}

export { json };
