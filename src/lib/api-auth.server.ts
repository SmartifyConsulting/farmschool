import { createHash } from "crypto";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", "cache-control": "no-store" } });

/** Verifies a learner API key; returns the owning user id or an error Response. */
export async function verifyApiKey(request: Request): Promise<{ userId: string } | Response> {
  const key = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "").trim() ?? "";
  if (!/^fp_[a-f0-9]{48}$/.test(key)) return json({ error: "Missing or invalid API key" }, 401);
  const hash = createHash("sha256").update(key).digest("hex");
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await supabaseAdmin.from("api_keys").select("id, user_id").eq("key_hash", hash).maybeSingle();
  if (!data) return json({ error: "Missing or invalid API key" }, 401);
  await supabaseAdmin.from("api_keys").update({ last_used_at: new Date().toISOString() }).eq("id", data.id);
  return { userId: data.user_id };
}

export { json };
