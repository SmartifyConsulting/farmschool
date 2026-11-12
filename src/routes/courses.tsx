import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Award, BadgeCheck, BookOpen, FileText } from "lucide-react";
import { Phone, Header, SearchBox, Sheet, ProgressBar, CanvasHeading } from "@/components/AppShell";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { courses } from "@/lib/courses";
import { useAuth, useProgress, useBookmarks, courseProgress } from "@/hooks/useLearning";
import { pageMeta } from "@/lib/page-meta";
import { credentialCode } from "@/lib/studio";
import { CourseViewToggle, useCourseView } from "@/components/CourseViewToggle";
import { readAllPages } from "@/lib/database-pages";
import { certificateStatus } from "@/lib/certificates";
import { extendedDeadline } from "@/lib/deadline-extension";
import { CohortEmailPreferences } from "@/components/CohortEmailPreferences";
import { CertificateDocument } from "@/components/CertificateDocument";
import { LearningPrograms } from "@/components/LearningPrograms";

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
  assigned: boolean;
  dueAt: string | null;
};

function MyCourses() {
  const [view, setView] = useCourseView("my-learning", "list");
  const [tab, setTab] = useState("In progress");
  const [openCertId, setOpenCertId] = useState<string | null>(null);
  const { user } = useAuth();
  const { data: progress = [], isLoading: progressLoading } = useProgress();
  const { ids } = useBookmarks();
  const { data: prof } = useQuery({
    queryKey: ["profile", user?.id],
    enabled: !!user,
    queryFn: async () => (await supabase.from("profiles").select("full_name").maybeSingle()).data,
  });
  const { data: certs = [], error: certificateError } = useQuery({
    queryKey: ["certificates", user?.id],
    enabled: !!user,
    refetchInterval: 30_000,
    queryFn: async () => {
      const { data } = await readAllPages(
        supabase
          .rpc("my_certificate_records", {}, { count: "exact" })
          .order("issued_at", { ascending: false })
          .order("id"),
      );
      return data;
    },
  });
  const name = prof?.full_name ?? user?.email?.split("@")[0] ?? "Guest";
  const openCert = certs.find((certificate) => certificate.id === openCertId) ?? null;
  const {
    data: assignments = [],
    isLoading: assignmentsLoading,
    error: assignmentsError,
  } = useQuery({
    queryKey: ["my-course-assignments", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data: memberships } = await readAllPages(
        supabase
          .from("cohort_members")
          .select("cohort_id", { count: "exact" })
          .eq("user_id", user!.id)
          .order("cohort_id"),
      );
      if (!memberships?.length) return [];
      const { data } = await readAllPages(
        supabase
          .from("cohort_course_assignments")
          .select("course_id,due_at", { count: "exact" })
          .in(
            "cohort_id",
            memberships.map((item) => item.cohort_id),
          )
          .order("cohort_id")
          .order("course_id"),
      );
      const extensions = await readAllPages(
        supabase
          .from("course_deadline_extensions")
          .select("course_id,due_at", { count: "exact" })
          .eq("user_id", user!.id)
          .order("course_id"),
      );
      return data.map((item) => ({
        ...item,
        due_at: extendedDeadline(
          item.due_at,
          extensions.data.find((extension) => extension.course_id === item.course_id)?.due_at,
        ),
      }));
    },
  });
  const {
    data: studio = [],
    isLoading: studioLoading,
    error: studioError,
  } = useQuery({
    queryKey: [
      "my-studio-courses",
      user?.id,
      progress.map((p) => p.course_id).join(","),
      ids.join(","),
      assignments.map((item) => item.course_id).join(","),
    ],
    enabled: !!user && !progressLoading && !assignmentsLoading,
    queryFn: async () => {
      const { data: enrollments, error: enrollmentError } = await supabase
        .from("course_enrollments")
        .select("course_id")
        .eq("user_id", user!.id)
        .limit(200);
      if (enrollmentError) throw enrollmentError;
      const studioIds = [
        ...new Set(
          [
            ...progress.map((p) => p.course_id),
            ...ids,
            ...assignments.map((item) => item.course_id),
            ...(enrollments ?? []).map((e) => e.course_id),
          ].filter((id) => /^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(id)),
        ),
      ];
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
        assigned: false,
        dueAt: null,
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
        assigned: assignments.some((item) => item.course_id === c.id),
        dueAt:
          assignments
            .filter((item) => item.course_id === c.id && item.due_at)
            .map((item) => item.due_at!)
            .sort()[0] ?? null,
        total,
        done: completed.size,
        pct: total ? Math.round((completed.size / total) * 100) : 0,
        started: rows.length > 0,
        saved: ids.includes(c.id),
      };
    });
    return [...creatorCourses, ...originals];
  }, [studio, progress, ids, assignments]);

  const visible = items.filter((c) => {
    if (tab === "Assigned") return c.assigned;
    if (tab === "Saved") return c.saved;
    if (tab === "Completed") return c.started && c.total > 0 && c.pct === 100;
    return c.started && c.pct < 100;
  });

  return (
    <Phone>
      <Header />
      <Sheet>
        <CanvasHeading title="My learning" />
        <CohortEmailPreferences />
        <LearningPrograms />
        <Link to="/cohorts" className="mt-2 inline-block text-sm font-semibold text-primary">
          Cohort reports for managers
        </Link>
        <Link to="/skills" className="mt-3 inline-block text-sm font-semibold text-primary">
          My skills & trainer feedback
        </Link>
        <div className="mt-3 flex justify-end">
          <CourseViewToggle view={view} onChange={setView} />
        </div>
        <div className="mt-4">
          <SearchBox />
        </div>
        <div
          className="mt-4 flex flex-wrap gap-1 rounded-2xl bg-muted p-1 text-sm md:max-w-xl"
          role="group"
          aria-label="Filter my courses"
        >
          {["In progress", "Assigned", "Completed", "Saved", "Certifications"].map((t) => (
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
          <ul className={view === "cards" ? "mt-4 grid gap-3 md:grid-cols-2" : "mt-4 grid gap-3"}>
            {certificateError && (
              <p role="alert">Could not load your certificates. Refresh to try again.</p>
            )}
            {certs.map((c) => (
              <li key={c.id}>
                <button
                  onClick={() => setOpenCertId(c.id)}
                  className="flex w-full items-center gap-3 rounded-xl border border-border p-3 text-left hover:bg-muted"
                >
                  <Award className="h-6 w-6 shrink-0 text-accent" />
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-medium">{c.title}</span>
                    <span className="flex items-center gap-1 text-xs text-muted-foreground">
                      <BadgeCheck className="h-3.5 w-3.5 text-primary" />
                      {certificateStatus(c)} · {new Date(c.issued_at).toLocaleDateString()} ·{" "}
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
          <div
            className={
              view === "cards" ? "mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3" : "mt-4 grid gap-3"
            }
          >
            {(progressLoading || studioLoading || assignmentsLoading) && (
              <p className="col-span-full text-sm text-muted-foreground">Loading your courses…</p>
            )}
            {studioError && (
              <p role="alert" className="col-span-full text-sm text-destructive">
                Could not load creator courses. Please try again.
              </p>
            )}
            {assignmentsError && (
              <p role="alert" className="col-span-full text-sm text-destructive">
                Could not load assigned courses. Please try again.
              </p>
            )}
            {visible.map((c) => (
              <Link
                key={`${c.source}-${c.id}`}
                to={c.source === "studio" ? "/class/$id" : "/course/$id"}
                params={{ id: c.id }}
                className={`flex gap-3 rounded-2xl border border-border p-3 hover:border-primary/50 ${view === "cards" ? "flex-col" : ""}`}
              >
                {c.cover ? (
                  <img
                    src={c.cover}
                    alt=""
                    className={
                      view === "cards"
                        ? "h-36 w-full rounded-xl object-cover"
                        : "h-20 w-20 shrink-0 rounded-xl object-cover"
                    }
                  />
                ) : (
                  <div
                    className={`grid shrink-0 place-items-center rounded-xl bg-muted ${view === "cards" ? "h-36 w-full" : "h-20 w-20"}`}
                  >
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
                  {c.assigned && (
                    <p className="mt-2 text-xs font-medium text-primary">
                      {c.dueAt
                        ? "Due " +
                          new Date(c.dueAt).toLocaleDateString("en-ZA", {
                            timeZone: "Africa/Johannesburg",
                          })
                        : "Assigned · No deadline"}
                    </p>
                  )}
                  {c.started && (
                    <div className="mt-3">
                      <ProgressBar pct={c.pct} label={`${c.done}/${c.total} lessons`} />
                    </div>
                  )}
                </div>
              </Link>
            ))}
            {!progressLoading &&
              !studioLoading &&
              !assignmentsLoading &&
              !studioError &&
              !assignmentsError &&
              visible.length === 0 && (
                <div className="col-span-full py-10 text-center text-sm text-muted-foreground">
                  {tab === "Assigned"
                    ? "No courses assigned yet."
                    : tab === "Saved"
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
      <Dialog open={!!openCert} onOpenChange={(o) => !o && setOpenCertId(null)}>
        <DialogContent className="max-w-2xl print:max-w-none print:border-0 print:shadow-none">
          <DialogTitle className="sr-only">Certificate</DialogTitle>
          {openCert && <CertificateDocument key={openCert.id} certificate={openCert} learnerName={name} />}
        </DialogContent>
      </Dialog>
    </Phone>
  );
}
