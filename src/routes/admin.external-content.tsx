import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import { Trash2, Upload, Link2, RefreshCw, Download } from "lucide-react";
import { Phone, Header, Sheet } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useConfirm } from "@/components/ConfirmDialog";
import { useAuth } from "@/hooks/useLearning";
import { supabase } from "@/integrations/supabase/client";
import { pageMeta } from "@/lib/page-meta";
import { friendlyError } from "@/lib/friendly-error";
import { STUDIO_CATEGORIES } from "@/lib/studio";
import { CSV_TEMPLATE, parseCsv } from "@/lib/external-content";
import { importVideos, checkVideoLinks } from "@/lib/external-content.functions";

export const Route = createFileRoute("/admin/external-content")({
  component: ExternalContentAdmin,
  head: () => pageMeta("External Content — Mobile School", "Manage approved training video providers, the shared video library and imports."),
});

type Item = { id: string; title: string; category: string; language: string; import_status: string; is_sample: boolean; embed_url: string | null; original_url: string; last_synced_at: string; provider_id: string; provider: { name: string } | null; links: { course: { id: string; title: string; published: boolean } | null }[] };

function summary(r: { created: number; updated: number; duplicates: number; errors: unknown[] }) {
  const parts = [];
  if (r.created) parts.push(`${r.created} new learning video${r.created === 1 ? "" : "s"} imported`);
  if (r.updated) parts.push(`${r.updated} updated`);
  if (r.duplicates) parts.push(r.duplicates === 1 && !r.created ? "This video is already in your library" : `${r.duplicates} already in your library`);
  if (r.errors.length) parts.push(`${r.errors.length} couldn't be imported`);
  return parts.join(" · ") || "Nothing to import.";
}

function ExternalContentAdmin() {
  const { user, ready } = useAuth();
  const qc = useQueryClient();
  const confirm = useConfirm();
  const runImport = useServerFn(importVideos);
  const runCheck = useServerFn(checkVideoLinks);
  const { data: isAdmin, isLoading } = useQuery({
    queryKey: ["admin-home-role", user?.id], enabled: !!user,
    queryFn: async () => (await supabase.rpc("has_role", { _user_id: user!.id, _role: "admin" })).data === true,
  });
  const { data: providers = [] } = useQuery({
    queryKey: ["ext-providers"], enabled: !!isAdmin,
    queryFn: async () => (await supabase.from("external_content_providers").select("*").order("name")).data ?? [],
  });
  const { data: items = [] } = useQuery({
    queryKey: ["ext-items"], enabled: !!isAdmin,
    queryFn: async () => ((await supabase.from("external_content_items")
      .select("id, title, category, language, import_status, is_sample, embed_url, original_url, last_synced_at, provider_id, provider:external_content_providers(name), links:course_external_content(course:studio_courses(id, title, published))")
      .order("created_at", { ascending: false })).data ?? []) as unknown as Item[],
  });
  const { data: imports = [] } = useQuery({
    queryKey: ["ext-imports"], enabled: !!isAdmin,
    queryFn: async () => (await supabase.from("external_content_imports").select("*").order("created_at", { ascending: false }).limit(30)).data ?? [],
  });
  const reload = () => { for (const k of ["ext-providers", "ext-items", "ext-imports", "video-library"]) qc.invalidateQueries({ queryKey: [k] }); };

  const [providerId, setProviderId] = useState("");
  const pid = providerId || providers[0]?.id || "";
  const [manual, setManual] = useState({ url: "", title: "", description: "", category: "Crop Farming", language: "English" });
  const [csv, setCsv] = useState(""); const [updateExisting, setUpdateExisting] = useState(false);
  const [busy, setBusy] = useState(false);
  const [lastErrors, setLastErrors] = useState<{ row: number; message: string }[]>([]);
  const [filter, setFilter] = useState({ cat: "", lang: "", prov: "" });
  const [np, setNp] = useState({ name: "", slug: "", website: "", attribution: "" });

  const doImport = async (method: "manual" | "csv", rows: Record<string, string>[]) => {
    if (!pid) { toast.error("Add a provider first."); return; }
    if (!rows.length) { toast.error(method === "csv" ? "The CSV has no rows under the header." : "Add a video link."); return; }
    setBusy(true);
    try {
      const r = await runImport({ data: { providerId: pid, method, updateExisting, rows } });
      setLastErrors(r.errors);
      (r.created || r.updated ? toast.success : r.errors.length ? toast.error : toast.info)(summary(r));
      if (method === "manual" && r.created) setManual({ ...manual, url: "", title: "", description: "" });
      if (method === "csv" && !r.errors.length) setCsv("");
      reload();
    } catch (e) { toast.error(friendlyError(e, "The import didn't finish. Please try again.")); }
    finally { setBusy(false); }
  };
  const removeItem = async (it: Item) => {
    if (it.links.length) { toast.warning("This video is used in a course.", { description: "Remove it from those courses first." }); return; }
    const ok = await confirm({ tone: "danger", title: "Remove this video from the library?", confirmLabel: "Remove video", cancelLabel: "Keep video",
      description: <p>“{it.title}” will be removed from the shared library. The video itself stays on the provider's site.</p> });
    if (!ok) return;
    const { error } = await supabase.from("external_content_items").delete().eq("id", it.id);
    if (error) toast.error(friendlyError(error, "We couldn't remove that video.")); else { toast.success("Video removed from the library."); reload(); }
  };
  const toggleProvider = async (id: string, enabled: boolean) => {
    const { error } = await supabase.from("external_content_providers").update({ enabled }).eq("id", id);
    if (error) toast.error("We couldn't change that provider."); else { toast.success(enabled ? "Provider turned on." : "Provider turned off. Its videos show as unavailable to learners."); reload(); }
  };
  const addProvider = async () => {
    const slug = (np.slug || np.name).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40);
    if (np.name.trim().length < 2 || !/^https:\/\//.test(np.website)) { toast.error("Add a name and a website starting with https://"); return; }
    const { error } = await supabase.from("external_content_providers").insert({ name: np.name.trim(), slug, website: np.website.trim(), attribution: np.attribution.trim() });
    if (error) toast.error(friendlyError(error, "We couldn't add that provider.")); else { toast.success("Provider added."); setNp({ name: "", slug: "", website: "", attribution: "" }); reload(); }
  };
  const checkLinks = async () => {
    setBusy(true);
    try { const r = await runCheck(); (r.broken ? toast.warning : toast.success)(r.broken ? `${r.broken} video link${r.broken === 1 ? " is" : "s are"} unavailable.` : `All ${r.ok} video links are working.`); reload(); }
    catch (e) { toast.error(friendlyError(e, "The link check didn't finish.")); } finally { setBusy(false); }
  };

  const shown = items.filter((i) => (!filter.cat || i.category === filter.cat) && (!filter.lang || i.language === filter.lang) && (!filter.prov || i.provider_id === filter.prov));
  const sel = "rounded-md border border-input bg-background px-2 py-2 text-sm";
  const status = (s: string) => <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${s === "active" ? "bg-primary/10 text-primary" : "bg-destructive/10 text-destructive"}`}>{s === "active" ? "Available" : s === "unavailable" ? "Unavailable" : "Pending"}</span>;

  return <Phone>
    <Header wide greeting="Administration" title="External Content">
      <div className="mt-3"><Link to="/admin" className="rounded-full border border-primary-foreground/50 px-3 py-1 text-xs">← Administration</Link></div>
    </Header>
    <Sheet wide>
      {!ready || (user && isLoading) ? <p className="py-8 text-sm text-muted-foreground">Checking permissions…</p>
      : !user ? <p className="py-8 text-sm"><Link to="/auth" className="font-semibold text-primary">Sign in</Link> to manage external content.</p>
      : !isAdmin ? <p className="py-8 text-sm text-muted-foreground">Only administrators can manage external content.</p>
      : <Tabs defaultValue="library" className="min-w-0">
        <TabsList className="flex h-auto flex-wrap justify-start">
          <TabsTrigger value="providers">Providers</TabsTrigger><TabsTrigger value="library">Video Library</TabsTrigger>
          <TabsTrigger value="imports">Imports</TabsTrigger><TabsTrigger value="usage">Course Usage</TabsTrigger>
        </TabsList>

        <TabsContent value="providers" className="space-y-4">
          {providers.map((p) => <div key={p.id} className="flex flex-wrap items-start justify-between gap-3 rounded-2xl border border-border p-4">
            <div className="min-w-0"><h3 className="font-semibold">{p.name}</h3><p className="break-all text-xs text-muted-foreground">{p.website}</p>
              <p className="mt-1 text-xs text-muted-foreground">Approved methods: {p.integration_methods.map((m: string) => m === "csv" ? "CSV import" : m === "manual" ? "Manual links" : m).join(", ")} · Automatic feed: not available (no public API offered)</p>
              <p className="mt-1 text-xs">{p.attribution}</p></div>
            <label className="flex items-center gap-2 text-sm">{p.enabled ? "On" : "Off"}<Switch checked={p.enabled} onCheckedChange={(v) => toggleProvider(p.id, v)} aria-label={`Enable ${p.name}`} /></label>
          </div>)}
          <div className="grid gap-2 rounded-2xl border border-dashed border-border p-4 sm:grid-cols-2">
            <h3 className="font-semibold sm:col-span-2">Add a provider</h3>
            <Input placeholder="Name" value={np.name} onChange={(e) => setNp({ ...np, name: e.target.value })} maxLength={120} />
            <Input placeholder="Website (https://…)" value={np.website} onChange={(e) => setNp({ ...np, website: e.target.value })} />
            <Input className="sm:col-span-2" placeholder="Attribution shown to learners" value={np.attribution} onChange={(e) => setNp({ ...np, attribution: e.target.value })} maxLength={300} />
            <Button onClick={addProvider} className="sm:w-fit">Add provider</Button>
          </div>
        </TabsContent>

        <TabsContent value="library" className="space-y-3">
          <div className="flex flex-wrap gap-2">
            <select className={sel} value={filter.cat} onChange={(e) => setFilter({ ...filter, cat: e.target.value })} aria-label="Category"><option value="">All categories</option>{[...new Set(items.map((i) => i.category))].sort().map((c) => <option key={c}>{c}</option>)}</select>
            <select className={sel} value={filter.lang} onChange={(e) => setFilter({ ...filter, lang: e.target.value })} aria-label="Language"><option value="">All languages</option>{[...new Set(items.map((i) => i.language))].sort().map((c) => <option key={c}>{c}</option>)}</select>
            <select className={sel} value={filter.prov} onChange={(e) => setFilter({ ...filter, prov: e.target.value })} aria-label="Provider"><option value="">All providers</option>{providers.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select>
          </div>
          <p className="text-xs text-muted-foreground">{shown.length} video{shown.length === 1 ? "" : "s"}. Records marked “Sample” are starter data for testing.</p>
          <ul className="space-y-2">{shown.map((i) => <li key={i.id} className="flex flex-wrap items-center gap-3 rounded-xl border border-border p-3">
            <div className="min-w-0 flex-1"><p className="text-sm font-medium">{i.title} {i.is_sample && <span className="ml-1 rounded-full bg-accent/20 px-2 py-0.5 text-[10px] font-semibold">Sample</span>}</p>
              <p className="text-xs text-muted-foreground">{i.provider?.name} · {i.category} · {i.language} · {i.embed_url ? "Embedded player" : "Link-out"} · used in {i.links.length} course{i.links.length === 1 ? "" : "s"}</p></div>
            {status(i.import_status)}
            <Button size="icon" variant="ghost" aria-label={`Remove ${i.title}`} onClick={() => removeItem(i)}><Trash2 className="h-4 w-4" /></Button>
          </li>)}</ul>
        </TabsContent>

        <TabsContent value="imports" className="space-y-4">
          <label className="flex items-center gap-2 text-sm">Provider<select className={sel} value={pid} onChange={(e) => setProviderId(e.target.value)} aria-label="Import provider">{providers.map((p) => <option key={p.id} value={p.id}>{p.name}{p.enabled ? "" : " (off)"}</option>)}</select></label>
          <div className="grid gap-4 lg:grid-cols-2">
            <section className="space-y-2 rounded-2xl border border-border p-4">
              <h3 className="flex items-center gap-2 font-semibold"><Link2 className="h-4 w-4" />Add one video link</h3>
              <Input placeholder="Video page or YouTube link (https://…)" value={manual.url} onChange={(e) => setManual({ ...manual, url: e.target.value })} aria-label="Video link" />
              <Input placeholder="Title (filled in automatically for YouTube)" value={manual.title} onChange={(e) => setManual({ ...manual, title: e.target.value })} maxLength={200} />
              <Textarea placeholder="Short description" value={manual.description} onChange={(e) => setManual({ ...manual, description: e.target.value })} rows={2} maxLength={4000} />
              <div className="grid grid-cols-2 gap-2">
                <select className={sel} value={manual.category} onChange={(e) => setManual({ ...manual, category: e.target.value })} aria-label="Category">{STUDIO_CATEGORIES.map((c) => <option key={c}>{c}</option>)}</select>
                <Input value={manual.language} onChange={(e) => setManual({ ...manual, language: e.target.value })} aria-label="Language" maxLength={40} />
              </div>
              <Button disabled={busy} onClick={() => doImport("manual", [manual])}>Add video</Button>
            </section>
            <section className="space-y-2 rounded-2xl border border-border p-4">
              <h3 className="flex items-center gap-2 font-semibold"><Upload className="h-4 w-4" />CSV import</h3>
              <p className="text-xs text-muted-foreground">Columns: title, url, description, category, language, thumbnail, duration, published. Duplicates are skipped automatically.</p>
              <div className="flex flex-wrap gap-2">
                <input type="file" accept=".csv,text/csv" aria-label="CSV file" className="text-xs file:mr-2 file:rounded-md file:border-0 file:bg-primary/10 file:px-3 file:py-2 file:text-primary" onChange={async (e) => { const f = e.target.files?.[0]; if (f) setCsv(await f.text()); e.target.value = ""; }} />
                <Button size="sm" variant="ghost" asChild><a href={`data:text/csv;charset=utf-8,${encodeURIComponent(CSV_TEMPLATE)}`} download="video-import-template.csv"><Download className="h-4 w-4" />Template</a></Button>
              </div>
              <Textarea value={csv} onChange={(e) => setCsv(e.target.value)} rows={5} placeholder="…or paste CSV here" aria-label="CSV text" />
              <label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={updateExisting} onChange={(e) => setUpdateExisting(e.target.checked)} />Refresh details of videos already in the library (course links are kept)</label>
              <Button disabled={busy || !csv.trim()} onClick={() => doImport("csv", parseCsv(csv))}>Import CSV</Button>
            </section>
          </div>
          {lastErrors.length > 0 && <div className="rounded-xl border border-destructive/40 bg-destructive/5 p-3 text-sm"><p className="font-semibold">Rows that need attention</p>
            <ul className="mt-1 list-disc pl-5 text-xs">{lastErrors.map((e, i) => <li key={i}>Row {e.row}: {e.message}</li>)}</ul></div>}
          <section className="space-y-2"><h3 className="font-semibold">Import history</h3>
            {imports.length === 0 ? <p className="text-sm text-muted-foreground">No imports yet.</p>
            : <ul className="space-y-1">{imports.map((h) => <li key={h.id} className="rounded-xl border border-border p-2 text-xs">
              <strong>{h.method === "csv" ? "CSV import" : h.method === "manual" ? "Manual link" : h.method === "link_check" ? "Link check" : "Feed"}</strong> · {new Date(h.created_at).toLocaleString()} · {h.method === "link_check" ? `${h.updated_count} working, ${h.error_count} unavailable` : `${h.created_count} new, ${h.updated_count} updated, ${h.duplicate_count} duplicates, ${h.error_count} errors`}
            </li>)}</ul>}
          </section>
        </TabsContent>

        <TabsContent value="usage" className="space-y-4">
          <Button variant="outline" disabled={busy} onClick={checkLinks}><RefreshCw className="h-4 w-4" />Check for broken links</Button>
          <section><h3 className="font-semibold">Used in courses</h3>
            <ul className="mt-2 space-y-2">{items.filter((i) => i.links.length).map((i) => <li key={i.id} className="rounded-xl border border-border p-3 text-sm">
              <p className="font-medium">{i.title} {status(i.import_status)}</p>
              <p className="text-xs text-muted-foreground">{i.links.map((l) => l.course ? `${l.course.title}${l.course.published ? "" : " (draft)"}` : "").filter(Boolean).join(" · ")}</p>
            </li>)}{!items.some((i) => i.links.length) && <li className="text-sm text-muted-foreground">No videos are used in courses yet.</li>}</ul></section>
          <section><h3 className="font-semibold">Not assigned to any course</h3>
            <p className="text-sm text-muted-foreground">{items.filter((i) => !i.links.length).map((i) => i.title).join(" · ") || "Every video is in use."}</p></section>
          <section><h3 className="font-semibold">Unavailable links</h3>
            <p className="text-sm text-muted-foreground">{items.filter((i) => i.import_status === "unavailable").map((i) => i.title).join(" · ") || "None found."}</p></section>
        </TabsContent>
      </Tabs>}
    </Sheet>
  </Phone>;
}
