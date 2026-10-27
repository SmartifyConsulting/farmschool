import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { syncMyMoodle } from "@/lib/learning.functions";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Clock, FileText } from "lucide-react";
import { Phone, Header, SearchBox, Sheet, ProgressBar } from "@/components/AppShell";
import { courses } from "@/lib/courses";
import { useAuth, useProgress, useBookmarks, courseProgress } from "@/hooks/useLearning";

export const Route = createFileRoute("/courses")({
  head: () => ({ meta: [
    { title: "My Courses — Mobile School" },
    { name: "description", content: "Track your in-progress, completed and saved agricultural courses." },
    { property: "og:title", content: "My Courses — Mobile School" },
    { property: "og:description", content: "Track your learning progress." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary_large_image" },
  ] }),
  component: MyCourses,
});

function MyCourses() {
  const [tab, setTab] = useState("In progress");
  const { user } = useAuth();
  const { data } = useProgress();
  const { ids } = useBookmarks();
  const { data: moodle } = useQuery({ queryKey: ["moodle-courses"], queryFn: async () => (await supabase.from("moodle_courses").select("moodle_id, title, summary, category, image_url").order("title")).data ?? [] });
  const { data: enrol, refetch } = useQuery({ queryKey: ["moodle-enrol", user?.id], enabled: !!user, queryFn: async () => (await supabase.from("moodle_enrolments").select("moodle_id, progress, completed")).data ?? [] });
  const sync = useServerFn(syncMyMoodle);
  const [syncing, setSyncing] = useState(false);
  const runSync = async () => { setSyncing(true); try { const r = await sync(); r.ok ? toast.success(r.message) : toast.info(r.message); refetch(); } finally { setSyncing(false); } };
  const list = courses.filter((c) => {
    const p = courseProgress(c, data);
    if (tab === "Saved") return ids.includes(c.id);
    if (tab === "Completed") return p.pct === 100;
    return p.started && p.pct < 100;
  });
  return (
    <Phone>
      <Header title="Your Course"><SearchBox /></Header>
      <Sheet>
        <div className="flex rounded-full bg-muted p-1 text-sm md:max-w-md">
          {["In progress", "Completed", "Saved"].map((t) => (
            <button key={t} onClick={() => setTab(t)} className={`flex-1 rounded-full py-1.5 ${tab === t ? "bg-primary text-primary-foreground" : "text-muted-foreground"}`}>{t}</button>
          ))}
        </div>
        {!user ? <p className="py-10 text-center text-sm text-muted-foreground"><Link to="/auth" className="font-semibold text-primary">Sign in</Link> to see your courses.</p> : (
        <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {list.map((c) => { const p = courseProgress(c, data); return (
            <Link key={c.id} to="/course/$id" params={{ id: c.id }} className="flex gap-3 rounded-2xl border border-border p-2.5">
              <img src={c.image} alt="" className="h-20 w-20 shrink-0 rounded-xl object-cover" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold">{c.title}</p>
                <div className="mt-1 flex gap-3 text-xs text-muted-foreground">
                  <span className="flex items-center gap-1"><Clock className="h-3 w-3 text-primary" />{c.duration}</span>
                  <span className="flex items-center gap-1"><FileText className="h-3 w-3 text-primary" />{p.total} Lessons</span>
                </div>
                <div className="mt-3"><ProgressBar pct={p.pct} label={`${p.done}/${p.total} Lessons`} /></div>
              </div>
            </Link>); })}
          {list.length === 0 && <p className="col-span-full py-10 text-center text-sm text-muted-foreground">{tab === "Saved" ? "Nothing saved yet — tap the bookmark on any course." : tab === "Completed" ? "No completed courses yet." : "Start a lesson to see it here."}</p>}
        </div>)}
        {user && <section className="mt-8"><div className="mb-3 flex items-center justify-between gap-2"><h2 className="font-semibold">From the Mobile School LMS</h2>
          <button onClick={runSync} disabled={syncing} className="rounded-full border border-primary px-3 py-1 text-xs text-primary">{syncing ? "Syncing…" : "Sync my Moodle progress"}</button></div>
          {!moodle?.length && <p className="text-sm text-muted-foreground">No Moodle courses yet.</p>}
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">{moodle.map((m) => (
            <div key={m.moodle_id} className="min-w-0 rounded-2xl border border-border p-3">
              {m.image_url && <img src={m.image_url} alt="" className="mb-2 h-28 w-full rounded-xl object-cover" />}
              <p className="truncate text-sm font-semibold">{m.title}</p>
              {m.category && <p className="text-xs text-primary">{m.category}</p>}
              <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{m.summary}</p>
              {(() => { const e = enrol?.find((x) => x.moodle_id === m.moodle_id); return e ? <div className="mt-2"><ProgressBar pct={e.completed ? 100 : e.progress} label={e.completed ? "Completed" : "Enrolled"} /></div> : null; })()}
            </div>))}</div></section>}
      </Sheet>
    </Phone>
  );
}
