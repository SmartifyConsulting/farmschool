import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Award, BadgeCheck, BookOpen, FileText, Printer } from "lucide-react";
import { Phone, Header, SearchBox, Sheet, ProgressBar, CanvasHeading } from "@/components/AppShell";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { courses } from "@/lib/courses";
import { useAuth, useProgress, useBookmarks, courseProgress } from "@/hooks/useLearning";
import { pageMeta } from "@/lib/page-meta";
import { credentialCode } from "@/lib/studio";
import logo from "@/assets/plusticity-logo-navy.png";

export const Route = createFileRoute("/courses")({
  head: () =>
    pageMeta(
      "My Learning — Plusticity",
      "Continue learning and track completed or saved courses you're taking.",
    ),
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
  const [openCert, setOpenCert] = useState<{ id: string; title: string; issued_at: string } | null>(
    null,
  );
  const { user } = useAuth();
  const { data: progress = [], isLoading: progressLoading } = useProgress();
  const { ids, signedIn } = useBookmarks();
  const { data: prof } = useQuery({
    queryKey: ["profile", user?.id],
    enabled: !!user,
    queryFn: async () =>
      (await supabase.from("profiles").select("full_name").maybeSingle()).data,
  });
  const { data: certs = [] } = useQuery({
    queryKey: ["certificates", user?.id],
    enabled: !!user,
    queryFn: async () =>
      (
        await supabase
          .from("certificates")
          .select("id, title, source, issued_at")
          .order("issued_at", { ascending: false })
      ).data ?? [],
  });
  const name = prof?.full_name ?? user?.email?.split("@")[0] ?? "Guest";
  const {
    data: studio = [],
    isLoading: studioLoading,
    error: studioError,
  } = useQuery({
    queryKey: ["my-studio-courses", user?.id, progress.map((p) => p.course_id).join(","), ids.join(",")],
    enabled: !!user && !progressLoading && signedIn,
    queryFn: async () => {
      const studioIds = [...new Set([
        ...progress.map((p) => p.course_id),
        ...ids,
      ].filter((id) => /^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(id)))];
      if (!studioIds.length) return [];
      const { data, error } = await supabase
        .from("studio_courses")
        .select("id,title,category,cover_url,studio_lessons(id)")
        .eq("published", true)
        .in("id", studioIds)
        .limit(200);
      if (error) throw error;
      return data ?? [];
    },
  });

  const items: LearningItem[] = useMemo(() => {
    const originals: LearningItem[] = courses.map((c) => {
      const p = courseProgress(c, progress);
      return {
        id: c.id,
        title: c.title,
        category: c.category,
        cover: c.image,
        source: "sample",
        total: p.total,
        done: p.done,
        pct: p.pct,
        started: p.started,
        saved: ids.includes(c.id),
      };
    });
    const creatorCourses: LearningItem[] = studio.map((c) => {
      const lessonIds = new Set((c.studio_lessons ?? []).map((l) => l.id));
      const rows = progress.filter((p) => p.course_id === c.id);
      const completed = new Set(
        rows.filter((p) => p.completed && lessonIds.has(p.lesson_id)).map((p) => p.lesson_id),
      );
      const total = lessonIds.size;
      return {
        id: c.id,
        title: c.title,
        category: c.category || "General",
        cover: c.cover_url,
        source: "studio",
        total,
        done: completed.size,
        pct: total ? Math.round((completed.size / total) * 100) : 0,
        started: rows.length > 0,
        saved: ids.includes(c.id),
      };
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
      <Header />
      <Sheet>
        <CanvasHeading title="My learning" />
        <div className="mt-4">
          <SearchBox />
        </div>
        <div
          className="mt-4 flex rounded-full bg-muted p-1 text-sm md:max-w-md"
          role="group"
          aria-label="Filter my courses"
        >
          {["In progress", "Completed", "Saved", "Certifications"].map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTab(t)}
              aria-pressed={tab === t}
              className={`flex-1 rounded-full px-2 py-2 ${tab === t ? "bg-primary text-primary-foreground" : "text-muted-foreground"}`}
            >
              {t}
            </button>
          ))}
        </div>
        {!user ? (
          <p className="py-10 text-center text-sm text-muted-foreground">
            <Link to="/auth" className="font-semibold text-primary">
              Sign in
            </Link>{" "}
            to see your courses.
          </p>
        ) : tab === "Certifications" ? (
          <ul className="mt-4 grid gap-3 md:grid-cols-2">
            {certs.map((c) => (
              <li key={c.id}>
                <button
                  onClick={() => setOpenCert(c)}
                  className="flex w-full items-center gap-3 rounded-xl border border-border p-3 text-left hover:bg-muted"
                >
                  <Award className="h-6 w-6 shrink-0 text-accent" />
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-medium">{c.title}</span>
                    <span className="flex items-center gap-1 text-xs text-muted-foreground">
                      <BadgeCheck className="h-3.5 w-3.5 text-primary" />
                      Plusticity Certified · {new Date(c.issued_at).toLocaleDateString()} ·{" "}
                      {credentialCode(c.id)}
                    </span>
                  </span>
                  <span className="text-xs font-semibold text-primary">View</span>
                </button>
              </li>
            ))}
            {certs.length === 0 && (
              <p className="py-8 text-center text-sm text-muted-foreground md:col-span-2">
                Finish a course and claim its certificate to see it here.
              </p>
            )}
          </ul>
        ) : (
          <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {(progressLoading || studioLoading) && (
              <p className="col-span-full text-sm text-muted-foreground">Loading your courses…</p>
            )}
            {studioError && (
              <p role="alert" className="col-span-full text-sm text-destructive">
                Could not load creator courses. Please try again.
              </p>
            )}
            {visible.map((c) => (
              <Link
                key={`${c.source}-${c.id}`}
                to={c.source === "studio" ? "/class/$id" : "/course/$id"}
                params={{ id: c.id }}
                className="flex gap-3 rounded-2xl border border-border p-3 hover:border-primary/50"
              >
                {c.cover ? (
                  <img
                    src={c.cover}
                    alt=""
                    className="h-20 w-20 shrink-0 rounded-xl object-cover"
                  />
                ) : (
                  <div className="grid h-20 w-20 shrink-0 place-items-center rounded-xl bg-muted">
                    <BookOpen className="h-6 w-6 text-primary" />
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <p className="line-clamp-2 text-sm font-semibold">{c.title}</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {c.category}
                    {c.source === "sample" ? " · Sample" : ""}
                  </p>
                  <p className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
                    <FileText className="h-3 w-3" />
                    {c.total} lessons
                  </p>
                  {c.started && (
                    <div className="mt-3">
                      <ProgressBar pct={c.pct} label={`${c.done}/${c.total} lessons`} />
                    </div>
                  )}
                </div>
              </Link>
            ))}
            {!progressLoading && !studioLoading && !studioError && visible.length === 0 && (
              <div className="col-span-full py-10 text-center text-sm text-muted-foreground">
                {tab === "Saved"
                  ? "No saved courses yet."
                  : tab === "Completed"
                    ? "No completed courses yet."
                    : "No courses in progress yet."}
                <p className="mt-3">
                  <Link to="/search" className="font-semibold text-primary">
                    Explore the catalogue
                  </Link>
                </p>
              </div>
            )}
          </div>
        )}
      </Sheet>
      <Dialog open={!!openCert} onOpenChange={(o) => !o && setOpenCert(null)}>
        <DialogContent className="max-w-2xl print:max-w-none print:border-0 print:shadow-none">
          <DialogTitle className="sr-only">Certificate</DialogTitle>
          {openCert && (
            <div
              id="certificate"
              className="rounded-2xl border-4 border-primary p-6 text-center sm:p-10"
            >
              <img src={logo} alt="Plusticity" className="mx-auto h-[176px] w-auto" />
              <p className="mt-4 text-xs font-semibold uppercase tracking-[0.2em] text-primary">
                Certificate of Completion
              </p>
              <p className="mt-4 text-sm text-muted-foreground">This certifies that</p>
              <p className="mt-1 font-display text-2xl font-bold sm:text-3xl">{name}</p>
              <p className="mt-3 text-sm text-muted-foreground">
                has completed every lesson and passed every assessment in
              </p>
              <p className="mt-1 text-lg font-semibold">{openCert.title}</p>
              <div className="mt-6 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-xs text-muted-foreground">
                <span>
                  Issued{" "}
                  {new Date(openCert.issued_at).toLocaleDateString(undefined, {
                    day: "numeric",
                    month: "long",
                    year: "numeric",
                  })}
                </span>
                <span className="flex items-center gap-1 font-semibold text-primary">
                  <BadgeCheck className="h-4 w-4" />
                  Verified · {credentialCode(openCert.id)}
                </span>
              </div>
            </div>
          )}
          <button
            onClick={() => window.print()}
            className="mx-auto flex items-center gap-2 rounded-full bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground print:hidden"
          >
            <Printer className="h-4 w-4" />
            Print or save as PDF
          </button>
        </DialogContent>
      </Dialog>
    </Phone>
  );
}
