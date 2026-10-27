import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { Fish, Droplets, Tractor, Store, Gauge, X } from "lucide-react";
import { Phone } from "@/components/AppShell";
import { categories, courses } from "@/lib/courses";
import { useProgress, courseProgress } from "@/hooks/useLearning";
import { BookmarkButton, ProgressBar } from "@/components/AppShell";

const icons = { Fish, Droplets, Tractor, Store, Gauge };

export const Route = createFileRoute("/search")({
  head: () => ({ meta: [
    { title: "Search Courses — Mobile School" },
    { name: "description", content: "Find agricultural courses by topic or category." },
    { property: "og:title", content: "Search — Mobile School" },
    { property: "og:description", content: "Find your next agricultural course." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary_large_image" },
  ] }),
  component: SearchPage,
});

function SearchPage() {
  const [q, setQ] = useState("");
  const { data } = useProgress();
  const [recent, setRecent] = useState(["aquaponics", "ph testing", "pricing produce", "sensors", "fish feed", "irrigation"]);
  const results = q === "*" ? courses : q ? courses.filter((c) => (c.title + c.category).toLowerCase().includes(q.toLowerCase())) : [];
  return (
    <Phone>
      <div className="bg-primary px-5 pb-5 pt-8 md:px-10"><div className="mx-auto max-w-6xl">
        <label className="flex items-center gap-2 rounded-xl bg-card px-3 py-2.5">
          <input value={q === "*" ? "" : q} onChange={(e) => setQ(e.target.value)} placeholder="What do you want to learn?" className="w-full bg-transparent text-sm outline-none" />
          {q && <button onClick={() => setQ("")} aria-label="Clear"><X className="h-4 w-4 text-muted-foreground" /></button>}
        </label>
      </div></div>
      <div className="mx-auto max-w-6xl px-5 pt-5 md:px-10">
        {q ? (
          <div className="grid gap-3 md:grid-cols-2">
            {results.map((c) => (
              <Link key={c.id} to="/course/$id" params={{ id: c.id }} className="flex items-center gap-3 rounded-xl border border-border p-2">
                <img src={c.image} alt="" className="h-14 w-14 rounded-lg object-cover" />
                <div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold">{c.title}</p><p className="text-xs text-muted-foreground">{c.category} · ${c.price}</p>{courseProgress(c, data).started && <div className="mt-1"><ProgressBar pct={courseProgress(c, data).pct} /></div>}</div><BookmarkButton courseId={c.id} />
              </Link>))}
            {results.length === 0 && <p className="py-10 text-center text-sm text-muted-foreground">No courses match “{q}”.</p>}
          </div>
        ) : (<>
          <div className="flex justify-between"><h2 className="font-semibold">Recent Search</h2><button onClick={() => setRecent([])} className="text-xs text-muted-foreground">Clear</button></div>
          <div className="mt-3 flex flex-wrap gap-2">{recent.map((r) => <button key={r} onClick={() => setQ(r.split(" ")[0] ?? r)} className="rounded-full border border-border px-3 py-1 text-xs text-primary">{r}</button>)}</div>
          <button onClick={() => setQ("*")} className="mt-6 w-full rounded-xl bg-primary py-2.5 text-sm font-semibold text-primary-foreground">Browse full catalogue</button>
          <h2 className="mt-6 font-semibold">Categories</h2>
          <div className="mt-3 space-y-4">{categories.map((cat) => { const I = icons[cat.icon]; return (
            <button key={cat.name} onClick={() => setQ(cat.name)} className="flex w-full items-center gap-3 text-left">
              <span className="grid h-10 w-10 place-items-center rounded-full bg-secondary text-primary"><I className="h-4 w-4" /></span>
              <span><span className="block text-sm font-medium">{cat.name}</span><span className="text-xs text-muted-foreground">{courses.filter((c) => c.category === cat.name).length} courses</span></span>
            </button>); })}</div>
        </>)}
      </div>
    </Phone>
  );
}
