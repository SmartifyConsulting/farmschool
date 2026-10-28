import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { BarChart3, Award, Users, RefreshCw } from "lucide-react";
import { getCourseAnalytics } from "@/lib/studio-ai.functions";
import { friendlyError } from "@/lib/friendly-error";
import { Button } from "@/components/ui/button";

const FILTERS = ["All", "In progress", "Completed", "Needs help"] as const;

export function CourseAnalytics({ courseId }: { courseId: string }) {
  const fetchStats = useServerFn(getCourseAnalytics);
  const [filter, setFilter] = useState<(typeof FILTERS)[number]>("All");
  const { data, error, isLoading, refetch, isFetching } = useQuery({ queryKey: ["course-analytics", courseId], queryFn: () => fetchStats({ data: { courseId } }) });
  const tone = (s: string) => s === "Completed" ? "bg-primary/15 text-primary" : s === "Needs help" ? "bg-destructive/15 text-destructive" : "bg-muted text-muted-foreground";
  return (
    <section aria-labelledby="perf" className="space-y-3 rounded-2xl border border-border p-4">
      <div className="flex items-center justify-between gap-2">
        <h2 id="perf" className="flex items-center gap-2 font-semibold"><BarChart3 className="h-4 w-4 text-primary" />Course performance</h2>
        <Button size="icon" variant="ghost" aria-label="Refresh performance" onClick={() => refetch()} disabled={isFetching}><RefreshCw className={`h-4 w-4 ${isFetching ? "animate-spin" : ""}`} /></Button>
      </div>
      {isLoading && <p className="text-sm text-muted-foreground">Loading learner activity…</p>}
      {error && <p className="text-sm text-destructive">{friendlyError(error)}</p>}
      {data && <>
        <div className="grid grid-cols-2 gap-2 text-center">
          {[["Learners", data.totals.learners], ["Completion", `${data.totals.completionRate}%`], ["Avg quiz score", data.totals.avgScore === null ? "—" : `${data.totals.avgScore}%`], ["Certificates", data.totals.certificates]].map(([label, value]) => (
            <div key={label} className="rounded-xl bg-muted/50 p-2"><p className="text-lg font-semibold">{value}</p><p className="text-[11px] text-muted-foreground">{label}</p></div>))}
        </div>
        {data.totals.passRate !== null && <p className="text-xs text-muted-foreground">Quiz pass rate across all attempts: {data.totals.passRate}%</p>}
        <div className="space-y-1.5">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Per lesson</h3>
          {data.lessons.length === 0 && <p className="text-xs text-muted-foreground">No lessons yet.</p>}
          {data.lessons.map((l, i) => (
            <div key={l.id} className="text-xs">
              <div className="flex justify-between gap-2"><span className="truncate">{i + 1}. {l.title}</span><span className="shrink-0 text-muted-foreground">{l.completionRate}%</span></div>
              <div className="mt-1 h-1.5 rounded-full bg-muted"><div className="h-1.5 rounded-full bg-primary" style={{ width: `${l.completionRate}%` }} /></div>
              {l.kind === "quiz" && l.attempts > 0 && <p className="mt-0.5 text-muted-foreground">{l.passes} passed · {l.fails} failed · avg {l.avgScore}%</p>}
            </div>))}
        </div>
        <div className="space-y-2">
          <h3 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground"><Users className="h-3.5 w-3.5" />Learners</h3>
          <div className="flex flex-wrap gap-1.5" role="group" aria-label="Filter learners">
            {FILTERS.map(f => <button key={f} aria-pressed={filter === f} onClick={() => setFilter(f)} className={`rounded-full px-2.5 py-1 text-[11px] font-medium ${filter === f ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}>{f}</button>)}
          </div>
          {data.learners.length === 0 && <p className="text-xs text-muted-foreground">No learners have started this course yet.</p>}
          <ul className="space-y-1.5">
            {data.learners.filter(l => filter === "All" || l.status === filter).map(l => (
              <li key={l.userId} className="rounded-xl border border-border p-2 text-xs">
                <div className="flex items-center justify-between gap-2"><span className="truncate font-medium">{l.name}</span><span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium ${tone(l.status)}`}>{l.status}</span></div>
                <p className="mt-0.5 text-muted-foreground">{[l.role, l.region].filter(Boolean).join(" · ")}</p>
                <p className="mt-0.5 flex items-center gap-1 text-muted-foreground">{l.percent}% done · {l.avgScore === null ? "no quiz yet" : `best quiz avg ${l.avgScore}%`}{l.certified && <><Award className="h-3 w-3 text-primary" />Certified</>}</p>
              </li>))}
          </ul>
        </div>
      </>}
    </section>
  );
}
