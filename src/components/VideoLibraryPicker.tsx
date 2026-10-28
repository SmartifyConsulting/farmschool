import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Library, Search, ExternalLink, PlayCircle } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { friendlyError } from "@/lib/friendly-error";

type Item = { id: string; title: string; description: string; thumbnail_url: string | null; category: string; language: string; embed_url: string | null; import_status: string; provider: { name: string } | null };

export function VideoLibraryPicker({ courseId, position, usedItemIds, onAdded }: { courseId: string; position: number; usedItemIds: string[]; onAdded: () => void }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState(""); const [cat, setCat] = useState(""); const [lang, setLang] = useState(""); const [prov, setProv] = useState("");
  const [pick, setPick] = useState<Item | null>(null);
  const [objectives, setObjectives] = useState("");
  const [busy, setBusy] = useState(false);
  const { data: items = [], isLoading, error } = useQuery({
    queryKey: ["video-library"], enabled: open,
    queryFn: async () => {
      const { data, error } = await supabase.from("external_content_items")
        .select("id, title, description, thumbnail_url, category, language, embed_url, import_status, provider:external_content_providers(name)")
        .neq("import_status", "unavailable").order("title");
      if (error) throw error;
      return (data ?? []) as unknown as Item[];
    },
  });
  const opts = (k: (i: Item) => string) => [...new Set(items.map(k))].sort();
  const shown = items.filter((i) => (!q || (i.title + " " + i.description).toLowerCase().includes(q.toLowerCase()))
    && (!cat || i.category === cat) && (!lang || i.language === lang) && (!prov || i.provider?.name === prov));

  const add = async () => {
    if (!pick || busy) return;
    setBusy(true);
    try {
      const { data: lesson, error: e1 } = await supabase.from("studio_lessons")
        .insert({ course_id: courseId, kind: "video", position, title: pick.title.slice(0, 120), body: "" }).select("id").single();
      if (e1) throw e1;
      const { error: e2 } = await supabase.from("course_external_content").insert({ course_id: courseId, lesson_id: lesson.id, item_id: pick.id, objectives });
      if (e2) { await supabase.from("studio_lessons").delete().eq("id", lesson.id); throw e2; }
      toast.success("Video added to your course.");
      setPick(null); setObjectives(""); setOpen(false); onAdded();
    } catch (e) { toast.error(friendlyError(e, "We couldn't add that video. Please try again.")); }
    finally { setBusy(false); }
  };

  const sel = "rounded-md border border-input bg-background px-2 py-2 text-sm";
  return <>
    <Button size="sm" variant="outline" onClick={() => setOpen(true)}><Library className="h-4 w-4" />From library</Button>
    <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) setPick(null); }}>
      <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Add a video from the library</DialogTitle>
          <DialogDescription>Free training videos from approved providers. Videos stay on the provider's site — nothing is copied.</DialogDescription>
        </DialogHeader>
        {pick ? <div className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-[200px_minmax(0,1fr)]">
            {pick.thumbnail_url ? <img src={pick.thumbnail_url} alt="" className="aspect-video w-full rounded-xl object-cover" /> : <div className="grid aspect-video place-items-center rounded-xl bg-primary/10 text-primary"><PlayCircle className="h-10 w-10" /></div>}
            <div className="min-w-0 space-y-1">
              <h3 className="font-semibold">{pick.title}</h3>
              <p className="text-xs text-muted-foreground">{pick.provider?.name} · {pick.category} · {pick.language} · {pick.embed_url ? "Plays inside the lesson" : "Opens on the provider's site"}</p>
              <p className="text-sm text-muted-foreground">{pick.description}</p>
              {usedItemIds.includes(pick.id) && <p className="text-xs font-medium text-accent-foreground">This video is already in this course.</p>}
            </div>
          </div>
          <label className="block text-sm font-medium">Learning objectives (one per line)
            <Textarea value={objectives} onChange={(e) => setObjectives(e.target.value)} rows={3} maxLength={2000} placeholder={"Explain why seedlings are thinned\nSow sorghum in straight rows"} className="mt-1" />
          </label>
          <div className="flex flex-wrap gap-2"><Button onClick={add} disabled={busy}>{busy ? "Adding…" : "Add to course"}</Button><Button variant="ghost" onClick={() => setPick(null)}>Back to library</Button></div>
        </div> : <div className="space-y-3">
          <div className="grid gap-2 sm:grid-cols-4">
            <div className="relative sm:col-span-4"><Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" /><Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search by topic" className="pl-8" aria-label="Search videos" /></div>
            <select value={cat} onChange={(e) => setCat(e.target.value)} className={sel} aria-label="Topic"><option value="">All topics</option>{opts((i) => i.category).map((c) => <option key={c}>{c}</option>)}</select>
            <select value={lang} onChange={(e) => setLang(e.target.value)} className={sel} aria-label="Language"><option value="">All languages</option>{opts((i) => i.language).map((c) => <option key={c}>{c}</option>)}</select>
            <select value={prov} onChange={(e) => setProv(e.target.value)} className={sel} aria-label="Provider"><option value="">All providers</option>{opts((i) => i.provider?.name ?? "").map((c) => <option key={c}>{c}</option>)}</select>
          </div>
          {isLoading ? <p className="py-6 text-center text-sm text-muted-foreground">Loading videos…</p>
            : error ? <p className="py-6 text-center text-sm text-muted-foreground">The video library is available to approved trainers.</p>
            : shown.length === 0 ? <p className="py-6 text-center text-sm text-muted-foreground">No videos match your search.</p>
            : <ul className="grid gap-2 sm:grid-cols-2">{shown.map((i) => <li key={i.id}>
              <button onClick={() => setPick(i)} className="flex w-full gap-3 rounded-xl border border-border p-2 text-left hover:bg-muted/50">
                {i.thumbnail_url ? <img src={i.thumbnail_url} alt="" className="h-14 w-24 shrink-0 rounded-lg object-cover" /> : <span className="grid h-14 w-24 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">{i.embed_url ? <PlayCircle className="h-5 w-5" /> : <ExternalLink className="h-5 w-5" />}</span>}
                <span className="min-w-0"><span className="line-clamp-2 text-sm font-medium">{i.title}</span><span className="block truncate text-xs text-muted-foreground">{i.provider?.name} · {i.category} · {i.language}</span>
                  {usedItemIds.includes(i.id) && <span className="text-xs text-primary">In this course</span>}</span>
              </button></li>)}</ul>}
        </div>}
      </DialogContent>
    </Dialog>
  </>;
}
