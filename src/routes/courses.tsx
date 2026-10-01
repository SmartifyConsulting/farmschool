import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { Clock, FileText } from "lucide-react";
import { Phone, Header, SearchBox, Sheet } from "@/components/AppShell";
import { courses } from "@/lib/courses";

export const Route = createFileRoute("/courses")({
  head: () => ({ meta: [
    { title: "My Courses — FarmerPlus Learning" },
    { name: "description", content: "Track your in-progress and completed agricultural courses." },
    { property: "og:title", content: "My Courses — FarmerPlus" },
    { property: "og:description", content: "Track your learning progress." },
  ] }),
  component: MyCourses,
});

function MyCourses() {
  const [tab, setTab] = useState("In progress");
  const list = courses.filter((c) => c.progress !== undefined).filter((c) => tab === "Completed" ? c.progress! >= 80 : tab === "In progress" ? c.progress! < 100 : true);
  return (
    <Phone>
      <Header title="Your Course"><SearchBox /></Header>
      <Sheet>
        <div className="flex rounded-full bg-muted p-1 text-sm">
          {["In progress", "Completed", "Downloads"].map((t) => (
            <button key={t} onClick={() => setTab(t)} className={`flex-1 rounded-full py-1.5 ${tab === t ? "bg-primary text-primary-foreground" : "text-muted-foreground"}`}>{t}</button>
          ))}
        </div>
        <div className="mt-4 space-y-3">
          {list.map((c) => (
            <Link key={c.id} to="/course/$id" params={{ id: c.id }} className="flex gap-3 rounded-2xl border border-border p-2.5">
              <img src={c.image} alt="" className="h-20 w-20 shrink-0 rounded-xl object-cover" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold">{c.title}</p>
                <div className="mt-1 flex gap-3 text-xs text-muted-foreground">
                  <span className="flex items-center gap-1"><Clock className="h-3 w-3 text-primary" />{c.duration}</span>
                  <span className="flex items-center gap-1"><FileText className="h-3 w-3 text-primary" />{c.lessons} Lessons</span>
                </div>
                <div className="mt-3 h-1.5 rounded-full bg-muted"><div className="h-full rounded-full bg-accent" style={{ width: `${c.progress}%` }} /></div>
                <div className="mt-1 flex justify-between text-[10px] text-muted-foreground"><span>{Math.round((c.progress! / 100) * c.lessons)}/{c.lessons} Lessons</span><span>{c.progress}%</span></div>
              </div>
            </Link>
          ))}
          {tab === "Downloads" && list.length === 0 && <p className="py-10 text-center text-sm text-muted-foreground">No downloads yet.</p>}
        </div>
      </Sheet>
    </Phone>
  );
}
