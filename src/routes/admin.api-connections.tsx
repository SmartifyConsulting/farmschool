import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import { useAuth } from "@/hooks/useLearning";
import { supabase } from "@/integrations/supabase/client";
import { Phone, Header, Sheet, CanvasHeading, useIsAdmin } from "@/components/AppShell";
import { AdminNav } from "@/components/AdminNav";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useConfirm } from "@/components/ConfirmDialog";
import { friendlyError } from "@/lib/friendly-error";
import { pageMeta } from "@/lib/page-meta";
import { toast } from "sonner";

export const Route = createFileRoute("/admin/api-connections")({
  component: ApiConnections,
  head: () => pageMeta("API connections — Plusticity", "Create, edit, revoke and delete API key connections."),
});

const SCOPES = [
  { id: "courses:read", label: "Read courses & lessons" },
  { id: "progress:read", label: "Read progress" },
] as const;

type KeyRow = {
  id: string; user_id: string; name: string; prefix: string; created_at: string;
  last_used_at: string | null; scopes: string[]; daily_limit: number; total_requests: number;
  revoked_at: string | null; ownerName?: string;
};
type Draft = { name: string; scopes: string[]; limit: string };

async function newKey() {
  const bytes = crypto.getRandomValues(new Uint8Array(24));
  const key = "fp_" + [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(key));
  const hash = [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
  return { key, hash, prefix: key.slice(0, 10) };
}

function KeyForm({ draft, onChange }: { draft: Draft; onChange: (d: Draft) => void }) {
  return (
    <div className="grid gap-2 sm:grid-cols-[1fr_auto]">
      <Input aria-label="Connection name" placeholder="Connection name" maxLength={60} value={draft.name}
        onChange={(e) => onChange({ ...draft, name: e.target.value })} />
      <Input aria-label="Daily limit" type="number" min="1" max="100000" className="sm:w-32" value={draft.limit}
        onChange={(e) => onChange({ ...draft, limit: e.target.value })} />
      <div className="flex flex-wrap gap-2 sm:col-span-2">
        {SCOPES.map((s) => {
          const on = draft.scopes.includes(s.id);
          return (
            <button type="button" key={s.id} aria-pressed={on}
              onClick={() => onChange({ ...draft, scopes: on ? draft.scopes.filter((x) => x !== s.id) : [...draft.scopes, s.id] })}
              className={`rounded-full border px-3 py-1 text-xs ${on ? "border-primary bg-primary text-primary-foreground" : "border-border text-muted-foreground"}`}>
              {s.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function validDraft(d: Draft) {
  const limit = Number(d.limit);
  if (!d.name.trim()) return "Give the connection a name.";
  if (!d.scopes.length) return "Pick at least one permission.";
  if (!Number.isFinite(limit) || limit < 1 || limit > 100000) return "Daily limit must be between 1 and 100000.";
  return null;
}

function ApiConnections() {
  const { user, ready } = useAuth();
  const admin = useIsAdmin();
  const qc = useQueryClient();
  const confirm = useConfirm();
  const [creating, setCreating] = useState<Draft | null>(null);
  const [editing, setEditing] = useState<({ id: string } & Draft) | null>(null);
  const [shown, setShown] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [showRevoked, setShowRevoked] = useState(false);
  const refresh = () => qc.invalidateQueries({ queryKey: ["admin-api-connections"] });

  const { data: rows, isLoading, error } = useQuery({
    queryKey: ["admin-api-connections"],
    enabled: admin,
    queryFn: async () => {
      let keys: KeyRow[];
      const all = await supabase.rpc("admin_list_api_keys" as never);
      if (!all.error) keys = (all.data ?? []) as unknown as KeyRow[];
      else {
        const { data, error } = await supabase.from("api_keys")
          .select("id, user_id, name, prefix, created_at, last_used_at, scopes, daily_limit, total_requests, revoked_at")
          .order("last_used_at", { ascending: false, nullsFirst: false });
        if (error) throw error;
        keys = (data ?? []) as KeyRow[];
      }
      const ids = [...new Set(keys.map((k) => k.user_id))];
      const { data: profiles } = ids.length
        ? await supabase.from("profiles").select("user_id, full_name").in("user_id", ids)
        : { data: [] as { user_id: string; full_name: string }[] };
      const names = new Map((profiles ?? []).map((p) => [p.user_id, p.full_name]));
      return keys.map((k) => ({ ...k, ownerName: names.get(k.user_id) ?? "Unknown user" }));
    },
  });

  const create = async () => {
    if (!creating || !user) return;
    const err = validDraft(creating);
    if (err) { toast.error(err); return; }
    setBusy(true);
    const k = await newKey();
    const { error } = await supabase.from("api_keys").insert({
      user_id: user.id, name: creating.name.trim(), prefix: k.prefix, key_hash: k.hash,
      scopes: creating.scopes, daily_limit: Math.round(Number(creating.limit)),
    } as never);
    setBusy(false);
    if (error) { toast.error(friendlyError(error, "Could not create this connection.")); return; }
    setShown(k.key);
    setCreating(null);
    toast.success("Connection created.");
    refresh();
  };

  const save = async () => {
    if (!editing) return;
    const err = validDraft(editing);
    if (err) { toast.error(err); return; }
    setBusy(true);
    const { error } = await supabase.rpc("admin_edit_api_key" as never, {
      _id: editing.id, _name: editing.name.trim(), _scopes: editing.scopes, _daily_limit: Math.round(Number(editing.limit)),
    } as never);
    setBusy(false);
    if (error) { toast.error(friendlyError(error, "Could not update this connection.")); return; }
    toast.success("Connection updated.");
    setEditing(null);
    refresh();
  };

  const revoke = async (k: KeyRow) => {
    if (!(await confirm({ title: "Revoke this connection?", description: `"${k.name}" will stop working immediately.`, confirmLabel: "Revoke", tone: "danger" }))) return;
    const { error } = await supabase.rpc("admin_revoke_api_key", { _id: k.id });
    if (error) { toast.error(friendlyError(error, "Could not revoke this connection.")); return; }
    toast.success("Connection revoked.");
    refresh();
  };

  const remove = async (k: KeyRow) => {
    if (!(await confirm({ title: "Delete this connection?", description: `"${k.name}" will be removed permanently.`, confirmLabel: "Delete", tone: "danger" }))) return;
    const { error } = await supabase.rpc("admin_delete_api_key" as never, { _id: k.id } as never);
    if (error) { toast.error(friendlyError(error, "Could not delete this connection.")); return; }
    toast.success("Connection deleted.");
    refresh();
  };

  const visible = (rows ?? []).filter((k) => showRevoked || !k.revoked_at);

  return (
    <Phone>
      <Header />
      <Sheet>
        <div className="mx-auto max-w-4xl space-y-4 pb-10">
          <CanvasHeading eyebrow="Admin" title="API connections" />
          {!ready ? (
            <p className="text-sm text-muted-foreground">Checking permissions…</p>
          ) : !user ? (
            <p className="text-sm"><Link to="/auth" className="font-semibold text-primary">Sign in</Link> as an administrator.</p>
          ) : !admin ? (
            <p className="text-sm text-muted-foreground">Administrator access required.</p>
          ) : (
            <>
              <AdminNav />
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm text-muted-foreground">Only the short prefix is ever shown — full keys can't be retrieved after creation.</p>
                <div className="flex gap-2">
                  <Button size="sm" variant="outline" onClick={() => setShowRevoked((v) => !v)}>
                    {showRevoked ? "Hide revoked" : "Show revoked"}
                  </Button>
                  <Button size="sm" onClick={() => setCreating({ name: "", scopes: ["courses:read"], limit: "1000" })}>
                    <Plus className="h-4 w-4" /> New connection
                  </Button>
                </div>
              </div>
              {shown && (
                <div role="status" className="rounded-2xl border border-primary bg-primary/10 p-4 text-sm">
                  <p className="font-semibold">Copy this key now — it won't be shown again.</p>
                  <code className="mt-2 block break-all rounded bg-card p-2 font-mono text-xs">{shown}</code>
                  <div className="mt-2 flex gap-2">
                    <Button size="sm" onClick={() => { void navigator.clipboard.writeText(shown); toast.success("Copied."); }}>Copy</Button>
                    <Button size="sm" variant="ghost" onClick={() => setShown(null)}>Done</Button>
                  </div>
                </div>
              )}
              {creating && (
                <div className="space-y-3 rounded-2xl border border-border p-4">
                  <p className="font-semibold">New connection</p>
                  <KeyForm draft={creating} onChange={setCreating} />
                  <div className="flex gap-2">
                    <Button size="sm" disabled={busy} onClick={create}>{busy ? "Creating…" : "Create"}</Button>
                    <Button size="sm" variant="ghost" onClick={() => setCreating(null)}>Cancel</Button>
                  </div>
                </div>
              )}
              {isLoading && <p className="text-sm text-muted-foreground">Loading…</p>}
              {error && <p role="alert" className="text-sm text-destructive">{friendlyError(error, "Could not load connections.")}</p>}
              {!isLoading && !error && visible.length === 0 && <p className="py-8 text-sm text-muted-foreground">No API connections yet.</p>}
              <div className="space-y-2">
                {visible.map((k) => (
                  <div key={k.id} className={`rounded-2xl border border-border p-4 ${k.revoked_at ? "opacity-60" : ""}`}>
                    {editing?.id === k.id ? (
                      <div className="space-y-3">
                        <KeyForm draft={editing} onChange={(d) => setEditing({ ...d, id: k.id })} />
                        <div className="flex gap-2">
                          <Button size="sm" disabled={busy} onClick={save}>Save</Button>
                          <Button size="sm" variant="ghost" onClick={() => setEditing(null)}>Cancel</Button>
                        </div>
                      </div>
                    ) : (
                      <>
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <p className="font-semibold">
                            {k.name} <span className="font-mono text-xs text-muted-foreground">{k.prefix}••••</span>
                            {k.revoked_at && <span className="ml-2 rounded-full bg-destructive/15 px-2 py-0.5 text-[11px] text-destructive">Revoked</span>}
                          </p>
                          <span className="text-xs text-muted-foreground">Owner: {k.ownerName}</span>
                        </div>
                        <p className="mt-1 text-xs text-muted-foreground">
                          Permissions: {k.scopes.join(", ")} · Daily limit {k.daily_limit} · {k.total_requests} total requests
                        </p>
                        <p className="text-xs text-muted-foreground">
                          Created {new Date(k.created_at).toLocaleDateString()} · Last used {k.last_used_at ? new Date(k.last_used_at).toLocaleDateString() : "never"}
                        </p>
                        <div className="mt-2 flex gap-2">
                          {!k.revoked_at ? (
                            <>
                              <Button size="sm" variant="outline" onClick={() => setEditing({ id: k.id, name: k.name, scopes: k.scopes, limit: String(k.daily_limit) })}>Edit</Button>
                              <Button size="sm" variant="outline" className="text-destructive" onClick={() => revoke(k)}>Revoke</Button>
                            </>
                          ) : (
                            <Button size="sm" variant="outline" className="text-destructive" onClick={() => remove(k)}>Delete</Button>
                          )}
                        </div>
                      </>
                    )}
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </Sheet>
    </Phone>
  );
}
