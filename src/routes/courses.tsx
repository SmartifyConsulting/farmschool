import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { BookOpen, FileText } from "lucide-react";
import { Phone, Header, SearchBox, Sheet, ProgressBar } from "@/components/AppShell";
import { supabase } from "@/integrations/supabase/client";
import { courses } from "@/lib/courses";
import { useAuth, useProgress, useBookmarks, courseProgress } from "@/hooks/useLearning";
import { pageMeta } from "@/lib/page-meta";

export const Route = createFileRoute("/courses")({
  head: () => pageMeta("My Courses — Mobile School", "Continue learning and track completed or saved courses."),
  component: MyCourses,
});

type LearningItem = {
  id: string;
  title: string;
  category: string;
  cover: string | null;
  source: "sample" | "studio";
  total: number;
  done: number;
  pct: number;
  started: boolean;
  saved: boolean;
};

function MyCourses() {
  const [tab, setTab] = useState("In progress");
  const { user } = useAuth();
  const { data: progress = [], isLoading: progressLoading } = useProgress();
  const { ids } = useBookmarks();
  const { data: studio = [], isLoading: studioLoading, error: studioError } = useQuery({
    queryKey: ["my-studio-courses", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase.from("studio_courses")
        .select("id,title,category,cover_url,studio_lessons(id)")
        .eq("published", true);
      if (error) throw error;
      return data ?? [];
    },
  });

  const items: LearningItem[] = useMemo(() => {
    const originals: LearningItem[] = courses.map((c) => {
      const p = courseProgress(c, progress);
      return { id: c.id, title: c.title, category: c.category, cover: c.image,
        source: "sample", total: p.total, done: p.done, pct: p.pct,
        started: p.started, saved: ids.includes(c.id) };
    });
    const creatorCourses: LearningItem[] = studio.map((c) => {
      const lessonIds = new Set((c.studio_lessons ?? []).map((l) => l.id));
      const rows = progress.filter((p) => p.course_id === c.id);
      const completed = new Set(rows.filter((p) => p.completed && lessonIds.has(p.lesson_id)).map((p) => p.lesson_id));
      const total = lessonIds.size;
      return { id: c.id, title: c.title, category: c.category || "General",
        cover: c.cover_url, source: "studio", total, done: completed.size,
        pct: total ? Math.round(completed.size / total * 100) : 0,
        started: rows.length > 0, saved: ids.includes(c.id) };
    });
    return [...creatorCourses, ...originals];
  }, [studio, progress, ids]);

  const visible = items.filter((c) => {
    if (tab === "Saved") return c.saved;
    if (tab === "Completed") return c.started && c.total > 0 && c.pct === 100;
    return c.started && c.pct < 100;
  });

  return (
    <Phone>
      <Header title="My courses"><SearchBox /></Header>
      <Sheet>
        <div className="flex rounded-full bg-muted p-1 text-sm md:max-w-md" role="group" aria-label="Filter my courses">
          {["In progress", "Completed", "Saved"].map((t) => (
            <button key={t} type="button" onClick={() => setTab(t)} aria-pressed={tab === t}
              className={`flex-1 rounded-full px-2 py-2 ${tab === t ? "bg-primary text-primary-foreground" : "text-muted-foreground"}`}>{t}</button>
          ))}
        </div>
        {!user ? <p className="py-10 text-center text-sm text-muted-foreground"><Link to="/auth" className="font-semibold text-primary">Sign in</Link> to see your courses.</p> : (
          <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {(progressLoading || studioLoading) && <p className="col-span-full text-sm text-muted-foreground">Loading your courses…</p>}
            {studioError && <p role="alert" className="col-span-full text-sm text-destructive">Could not load creator courses. Please try again.</p>}
            {visible.map((c) => (
              <Link key={`${c.source}-${c.id}`} to={c.source === "studio" ? "/class/$id" : "/course/$id"} params={{ id: c.id }}
                className="flex gap-3 rounded-2xl border border-border p-3 hover:border-primary/50">
                {c.cover ? <img src={c.cover} alt="" className="h-20 w-20 shrink-0 rounded-xl object-cover" /> :
                  <div className="grid h-20 w-20 shrink-0 place-items-center rounded-xl bg-muted"><BookOpen className="h-6 w-6 text-primary" /></div>}
                <div className="min-w-0 flex-1">
                  <p className="line-clamp-2 text-sm font-semibold">{c.title}</p>
                  <p className="mt-1 text-xs text-muted-foreground">{c.category}{c.source === "sample" ? " · Sample" : ""}</p>
                  <p className="mt-1 flex items-center gap-1 text-xs text-muted-foreground"><FileText className="h-3 w-3" />{c.total} lessons</p>
                  {c.started && <div className="mt-3"><ProgressBar pct={c.pct} label={`${c.done}/${c.total} lessons`} /></div>}
                </div>
              </Link>
            ))}
            {!progressLoading && !studioLoading && !studioError && visible.length === 0 &&
              <div className="col-span-full py-10 text-center text-sm text-muted-foreground">
                {tab === "Saved" ? "No saved courses yet." : tab === "Completed" ? "No completed courses yet." : "No courses in progress yet."}
                <p className="mt-3"><Link to="/search" className="font-semibold text-primary">Explore the catalogue</Link></p>
              </div>}
          </div>
        )}
      </Sheet>
    </Phone>
  );
}
