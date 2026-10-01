import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { Clock, FileText } from "lucide-react";
import { Phone, Header, SearchBox, Sheet, ProgressBar } from "@/components/AppShell";
import { courses } from "@/lib/courses";
import { useAuth, useProgress, useBookmarks, courseProgress } from "@/hooks/useLearning";

export const Route = createFileRoute("/courses")({
  head: () => ({ meta: [
    { title: "My Courses — FarmerPlus Learning" },
    { name: "description", content: "Track your in-progress, completed and saved agricultural courses." },
    { property: "og:title", content: "My Courses — FarmerPlus" },
    { property: "og:description", content: "Track your learning progress." },
  ] }),
  component: MyCourses,
});

function MyCourses() {
  const [tab, setTab] = useState("In progress");
  const { user } = useAuth();
  const { data } = useProgress();
  const { ids } = useBookmarks();
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
      </Sheet>
    </Phone>
  );
}
