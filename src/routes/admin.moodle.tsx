import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Phone, Header, Sheet } from "@/components/AppShell";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useLearning";
import { inputCls } from "@/components/PasswordInput";
import { getMyAdminState, saveMoodleSettings, testMoodleConnection, syncMoodleCatalogue } from "@/lib/moodle.functions";

export const Route = createFileRoute("/admin/moodle")({
  head: () => ({ meta: [
    { title: "Moodle connection — Mobile School" },
    { name: "description", content: "Administrator settings to connect Mobile School to a Moodle learning platform." },
    { property: "og:title", content: "Moodle connection — Mobile School" },
    { property: "og:description", content: "Configure, test and sync the Moodle integration." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
  ] }),
  component: MoodleAdmin,
});

const fmt = (d: string | null | undefined) => (d ? new Date(d).toLocaleString() : "never");

function MoodleAdmin() {
  const { user, ready } = useAuth();
  const qc = useQueryClient();
  const stateFn = useServerFn(getMyAdminState);
  const save = useServerFn(saveMoodleSettings);
  const test = useServerFn(testMoodleConnection);
  const sync = useServerFn(syncMoodleCatalogue);
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [url, setUrl] = useState("");
  const [enabled, setEnabled] = useState(false);

  const { data: st } = useQuery({ queryKey: ["admin-state", user?.id], enabled: !!user, queryFn: () => stateFn() });
  const { data: s } = useQuery({ queryKey: ["moodle-settings"], enabled: !!st?.isAdmin, queryFn: async () => (await supabase.from("moodle_settings").select("*").eq("id", 1).single()).data });
  const { data: logs } = useQuery({ queryKey: ["moodle-log"], enabled: !!st?.isAdmin, queryFn: async () => (await supabase.from("moodle_sync_log").select("*").order("created_at", { ascending: false }).limit(10)).data ?? [] });
  useEffect(() => { if (s) { setUrl(s.base_url); setEnabled(s.enabled); } }, [s]);

  const act = async (fn: () => Promise<{ message?: string } | unknown>, done?: string) => {
    setBusy(true); setMsg(null);
    try { const r = (await fn()) as { message?: string }; setMsg(r?.message ?? done ?? "Done"); }
    catch (e) { setMsg(e instanceof Error ? e.message : "Something went wrong"); }
    setBusy(false); qc.invalidateQueries();
  };

  return (
    <Phone>
      <Header title="Moodle connection" greeting="Administration" />
      <Sheet>
        {ready && !user ? <p className="py-10 text-center text-sm text-muted-foreground"><Link to="/auth" className="font-semibold text-primary">Sign in</Link> as an administrator.</p>
        : st && !st.isAdmin ? (
          <div className="py-10 text-center text-sm text-muted-foreground">
            {st.adminExists ? <p>Only administrators can view this page.</p> : <>
              <p className="mb-3">No administrator has been assigned. Ask the platform owner to assign one securely through Supabase.</p>
            </>}
            {msg && <p className="mt-3">{msg}</p>}
          </div>
        ) : st?.isAdmin && s ? (
          <div className="grid min-w-0 gap-6 lg:grid-cols-[1fr_340px]">
            <div className="min-w-0 space-y-4">
              <div className="rounded-2xl border border-border p-4 text-sm">
                <h2 className="mb-2 font-semibold">Status</h2>
                <p>Connection: <b>{s.status.replace("_", " ")}</b>{s.site_name && ` · ${s.site_name}`}</p>
                <p className="text-muted-foreground">Token: {st.tokenConfigured ? "configured securely" : "not set yet"}</p>
                <p className="text-muted-foreground">Last test: {fmt(s.last_tested_at)} · Last sync: {fmt(s.last_sync_at)}</p>
                {s.last_error && <p className="mt-1 text-destructive">{s.last_error}</p>}
              </div>
              <form className="space-y-3 rounded-2xl border border-border p-4" onSubmit={(e) => { e.preventDefault(); act(() => save({ data: { baseUrl: url, enabled } }), "Settings saved"); }}>
                <h2 className="font-semibold">Settings</h2>
                <input placeholder="https://moodle.example.org" value={url} onChange={(e) => setUrl(e.target.value)} className={inputCls} />
                <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} /> Integration enabled</label>
                <div className="flex flex-wrap gap-2">
                  <button disabled={busy} className="rounded-full bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground">Save</button>
                  <button type="button" disabled={busy} onClick={() => act(() => test())} className="rounded-full border border-border px-4 py-2 text-sm">Test connection</button>
                  <button type="button" disabled={busy} onClick={() => act(() => sync())} className="rounded-full bg-accent px-4 py-2 text-sm font-semibold text-accent-foreground">Sync catalogue</button>
                </div>
                {msg && <p className="text-sm">{msg}</p>}
              </form>
              <div className="rounded-2xl border border-border p-4 text-sm">
                <h2 className="mb-2 font-semibold">Recent activity</h2>
                <ul className="space-y-1">{logs?.map((l) => <li key={l.id} className={l.ok ? "" : "text-destructive"}>{fmt(l.created_at)} · {l.action} · {l.message}</li>)}
                  {logs?.length === 0 && <li className="text-muted-foreground">Nothing yet.</li>}</ul>
              </div>
            </div>
            <aside className="min-w-0 space-y-2 rounded-2xl bg-muted p-4 text-xs text-muted-foreground">
              <h2 className="text-sm font-semibold text-foreground">To activate</h2>
              <ol className="list-decimal space-y-1 pl-4">
                <li>Host Moodle (HTTPS) with admin access.</li>
                <li>Enable Web services and the REST protocol.</li>
                <li>Create an external service with core_webservice_get_site_info, core_course_get_categories, core_course_get_courses, core_course_search_courses.</li>
                <li>Create a token for a dedicated service user and give it to us to store securely.</li>
                <li>Enter the Moodle URL here, enable, test, then sync.</li>
              </ol>
              <p>Built-in lessons and the AI assistant keep working even if Moodle is offline.</p>
            </aside>
          </div>
        ) : <p className="py-10 text-center text-sm text-muted-foreground">Loading…</p>}
      </Sheet>
    </Phone>
  );
}
