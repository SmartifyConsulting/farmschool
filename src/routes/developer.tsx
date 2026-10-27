import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Copy, Check, RefreshCw, Ban, Trash2, Pencil } from "lucide-react";
import { Phone, Header, Sheet } from "@/components/AppShell";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useLearning";
import { inputCls } from "@/components/PasswordInput";

export const Route = createFileRoute("/developer")({
  head: () => ({ meta: [
    { title: "API Keys — Mobile School" },
    { name: "description", content: "Create, rotate and revoke scoped API keys with usage limits for Mobile School lessons." },
    { property: "og:title", content: "API Keys — Mobile School" },
    { property: "og:description", content: "Manage secure access to your lessons." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary_large_image" },
  ] }),
  component: Developer,
});

const SCOPES = [
  { id: "courses:read", label: "Read courses & lessons" },
  { id: "progress:read", label: "Read my progress" },
] as const;
const LIMITS = [100, 1000, 5000, 10000];

type Key = { id: string; name: string; prefix: string; created_at: string; last_used_at: string | null; scopes: string[]; daily_limit: number; usage_count: number; usage_date: string; total_requests: number; revoked_at: string | null; rotated_at: string | null };

async function newKey() {
  const bytes = crypto.getRandomValues(new Uint8Array(24));
  const key = "fp_" + [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(key));
  const hash = [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
  return { key, hash, prefix: key.slice(0, 10) };
}
const fmtDate = (d: string | null) => (d ? new Date(d).toLocaleDateString() : "never");

function ScopePicker({ value, onChange }: { value: string[]; onChange: (v: string[]) => void }) {
  return (
    <div className="flex flex-wrap gap-2">
      {SCOPES.map((s) => { const on = value.includes(s.id); return (
        <button type="button" key={s.id} aria-pressed={on} onClick={() => onChange(on ? value.filter((x) => x !== s.id) : [...value, s.id])}
          className={`rounded-full border px-3 py-1 text-xs ${on ? "border-primary bg-primary text-primary-foreground" : "border-border text-muted-foreground"}`}>{s.label}</button>); })}
    </div>
  );
}

function Developer() {
  const { user, ready } = useAuth();
  const qc = useQueryClient();
  const [name, setName] = useState("");
  const [scopes, setScopes] = useState<string[]>(["courses:read"]);
  const [limit, setLimit] = useState(1000);
  const [shown, setShown] = useState<{ key: string; label: string } | null>(null);
  const [copied, setCopied] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [edit, setEdit] = useState<{ scopes: string[]; limit: number }>({ scopes: [], limit: 1000 });

  const { data: keys } = useQuery({
    queryKey: ["api_keys", user?.id], enabled: !!user,
    queryFn: async () => (await supabase.from("api_keys").select("id, name, prefix, created_at, last_used_at, scopes, daily_limit, usage_count, usage_date, total_requests, revoked_at, rotated_at").order("created_at", { ascending: false })).data as Key[] ?? [],
  });
  const refresh = () => qc.invalidateQueries({ queryKey: ["api_keys"] });
  const run = async (p: PromiseLike<{ error: { message: string } | null }>) => { const { error } = await p; setErr(error?.message ?? null); refresh(); return !error; };

  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!scopes.length) return setErr("Pick at least one scope.");
    const k = await newKey();
    if (await run(supabase.from("api_keys").insert({ user_id: user!.id, name: name.trim().slice(0, 60) || "My key", prefix: k.prefix, key_hash: k.hash, scopes, daily_limit: limit })))
      { setShown({ key: k.key, label: "New key created" }); setCopied(false); setName(""); }
  };
  const rotate = async (id: string) => {
    if (!confirm("Rotate this key? The old key stops working immediately.")) return;
    const k = await newKey();
    if (await run(supabase.from("api_keys").update({ key_hash: k.hash, prefix: k.prefix, rotated_at: new Date().toISOString() }).eq("id", id)))
      { setShown({ key: k.key, label: "Key rotated — update your apps" }); setCopied(false); }
  };
  const revoke = (id: string) => confirm("Revoke this key? It will stop working immediately and can't be restored.") && run(supabase.from("api_keys").update({ revoked_at: new Date().toISOString() }).eq("id", id));
  const remove = (id: string) => confirm("Delete this revoked key from the list?") && run(supabase.from("api_keys").delete().eq("id", id));
  const saveEdit = async (id: string) => {
    if (!edit.scopes.length) return setErr("Pick at least one scope.");
    if (await run(supabase.from("api_keys").update({ scopes: edit.scopes, daily_limit: edit.limit }).eq("id", id))) setEditing(null);
  };

  const origin = typeof window === "undefined" ? "" : window.location.origin;
  const today = new Date().toISOString().slice(0, 10);
  const active = keys?.filter((k) => !k.revoked_at) ?? [];
  const revoked = keys?.filter((k) => k.revoked_at) ?? [];

  return (
    <Phone>
      <Header title="API keys" greeting="Developer access" />
      <Sheet>
        {ready && !user ? <p className="py-10 text-center text-sm text-muted-foreground"><Link to="/auth" className="font-semibold text-primary">Sign in</Link> to manage API keys.</p> : (
        <div className="grid min-w-0 gap-8 lg:grid-cols-[1fr_340px]">
          <div className="min-w-0">
            <form onSubmit={create} className="space-y-3 rounded-2xl border border-border p-4">
              <h2 className="font-semibold">Create a key</h2>
              <input placeholder="Key name, e.g. My website" maxLength={60} value={name} onChange={(e) => setName(e.target.value)} className={inputCls} />
              <div><p className="mb-1.5 text-xs font-medium text-muted-foreground">Scopes</p><ScopePicker value={scopes} onChange={setScopes} /></div>
              <label className="block text-xs font-medium text-muted-foreground">Daily request limit
                <select value={limit} onChange={(e) => setLimit(+e.target.value)} className={`${inputCls} mt-1`}>{LIMITS.map((l) => <option key={l} value={l}>{l.toLocaleString()} per day</option>)}</select>
              </label>
              <button className="w-full rounded-full bg-accent py-2.5 text-sm font-semibold text-accent-foreground">Create key</button>
            </form>
            {err && <p className="mt-2 text-sm text-destructive">{err}</p>}
            {shown && <div className="mt-4 rounded-xl border border-accent bg-secondary p-3 text-sm">
              <p className="font-semibold">{shown.label}. Copy it now — it won't be shown again.</p>
              <div className="mt-2 flex min-w-0 items-center gap-2"><code className="min-w-0 flex-1 break-all rounded bg-card px-2 py-1 text-xs">{shown.key}</code>
                <button aria-label="Copy key" onClick={() => { navigator.clipboard.writeText(shown.key); setCopied(true); }}>{copied ? <Check className="h-4 w-4 text-primary" /> : <Copy className="h-4 w-4" />}</button></div>
              <button onClick={() => setShown(null)} className="mt-2 text-xs text-muted-foreground">I've saved it</button>
            </div>}

            <h2 className="mb-2 mt-6 font-semibold">Active keys</h2>
            <ul className="space-y-3">
              {active.map((k) => { const used = k.usage_date === today ? k.usage_count : 0; const pct = Math.min(100, Math.round((used / k.daily_limit) * 100)); return (
                <li key={k.id} className="min-w-0 rounded-2xl border border-border p-3 text-sm">
                  <div className="flex min-w-0 items-start gap-2">
                    <div className="min-w-0 flex-1"><p className="truncate font-medium">{k.name}</p><p className="truncate text-xs text-muted-foreground">{k.prefix}… · created {fmtDate(k.created_at)}{k.rotated_at && ` · rotated ${fmtDate(k.rotated_at)}`} · last used {fmtDate(k.last_used_at)}</p></div>
                    <div className="flex shrink-0 gap-1">
                      <button aria-label="Edit scopes and limit" onClick={() => { setEditing(editing === k.id ? null : k.id); setEdit({ scopes: k.scopes, limit: k.daily_limit }); }} className="grid h-8 w-8 place-items-center rounded-full hover:bg-muted"><Pencil className="h-4 w-4" /></button>
                      <button aria-label="Rotate key" onClick={() => rotate(k.id)} className="grid h-8 w-8 place-items-center rounded-full hover:bg-muted"><RefreshCw className="h-4 w-4" /></button>
                      <button aria-label="Revoke key" onClick={() => revoke(k.id)} className="grid h-8 w-8 place-items-center rounded-full text-destructive hover:bg-muted"><Ban className="h-4 w-4" /></button>
                    </div>
                  </div>
                  <div className="mt-2 flex flex-wrap gap-1">{k.scopes.map((s) => <span key={s} className="rounded-full bg-secondary px-2 py-0.5 text-[10px] text-secondary-foreground">{s}</span>)}</div>
                  <div className="mt-2"><div className="h-1.5 rounded-full bg-muted"><div className={`h-full rounded-full ${pct >= 90 ? "bg-destructive" : "bg-accent"}`} style={{ width: `${pct}%` }} /></div>
                    <p className="mt-1 text-[11px] text-muted-foreground">{used.toLocaleString()} / {k.daily_limit.toLocaleString()} requests today · {k.total_requests.toLocaleString()} total</p></div>
                  {editing === k.id && <div className="mt-3 space-y-2 border-t border-border pt-3">
                    <ScopePicker value={edit.scopes} onChange={(s) => setEdit({ ...edit, scopes: s })} />
                    <select value={edit.limit} onChange={(e) => setEdit({ ...edit, limit: +e.target.value })} className={inputCls}>{LIMITS.map((l) => <option key={l} value={l}>{l.toLocaleString()} per day</option>)}</select>
                    <button onClick={() => saveEdit(k.id)} className="rounded-full bg-primary px-4 py-1.5 text-xs font-semibold text-primary-foreground">Save changes</button>
                  </div>}
                </li>); })}
              {keys && active.length === 0 && <li className="text-sm text-muted-foreground">No active keys.</li>}
            </ul>
            {revoked.length > 0 && <>
              <h2 className="mb-2 mt-6 font-semibold text-muted-foreground">Revoked</h2>
              <ul className="divide-y divide-border">{revoked.map((k) => (
                <li key={k.id} className="flex min-w-0 items-center gap-2 py-2 text-sm text-muted-foreground">
                  <span className="min-w-0 flex-1 truncate line-through">{k.name} · {k.prefix}…</span><span className="shrink-0 text-xs">revoked {fmtDate(k.revoked_at)}</span>
                  <button aria-label="Delete" onClick={() => remove(k.id)}><Trash2 className="h-4 w-4" /></button>
                </li>))}</ul>
            </>}
          </div>
          <aside className="min-w-0 space-y-3 rounded-2xl bg-muted p-4 text-xs">
            <h2 className="text-sm font-semibold">Security</h2>
            <ul className="list-disc space-y-1 pl-4 text-muted-foreground">
              <li>Keys are stored scrambled — we can never show a key again after creation.</li>
              <li>Give each app its own key with only the scopes it needs.</li>
              <li>Rotate a key if it may have leaked; revoke keys you no longer use.</li>
              <li>Requests over the daily limit are refused until the next day (UTC).</li>
            </ul>
            <h2 className="pt-2 text-sm font-semibold">How to use</h2>
            <p className="font-medium">Courses & lessons <span className="text-muted-foreground">(courses:read)</span></p>
            <pre className="whitespace-pre-wrap break-all rounded bg-card p-2">{`curl ${origin}/api/public/v1/courses -H "Authorization: Bearer fp_..."`}</pre>
            <p className="font-medium">Your progress <span className="text-muted-foreground">(progress:read)</span></p>
            <pre className="whitespace-pre-wrap break-all rounded bg-card p-2">{`curl ${origin}/api/public/v1/progress -H "Authorization: Bearer fp_..."`}</pre>
          </aside>
        </div>)}
      </Sheet>
    </Phone>
  );
}
