import { createFileRoute, Link, Outlet, useRouterState } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { PenSquare, Package, Library, ZoomIn, ZoomOut } from "lucide-react";
import { Phone, Header, Sheet, CanvasHeading } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useLearning";
import { CourseWizard } from "@/components/CourseWizard";
import { StudioCourseActions } from "@/components/StudioCourseActions";
import { CourseViewToggle, useCourseView } from "@/components/CourseViewToggle";

/** Card-grid column counts from most spacious (fewest, largest cards) to most compact (most, smallest cards per row). */
const CARD_GRID_CLASSES = [
  "md:grid-cols-2 xl:grid-cols-3",
  "md:grid-cols-3 xl:grid-cols-4",
  "md:grid-cols-4 xl:grid-cols-5",
  "md:grid-cols-5 xl:grid-cols-6",
];

export const Route = createFileRoute("/studio")({
  head: () => ({
    meta: [
      { title: "Course Studio — Plusticity" },
      {
        name: "description",
        content: "Create courses with video lessons, readings and quizzes across industries.",
      },
      { property: "og:title", content: "Course Studio — Plusticity" },
      { property: "og:description", content: "Build and publish courses across industries." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: StudioLayout,
});

function StudioLayout() {
  const path = useRouterState({ select: (s) => s.location.pathname });
  return path === "/studio" || path === "/studio/" ? <Studio /> : <Outlet />;
}

function Studio() {
  const [view, setView] = useCourseView("studio", "cards");
  const { user, ready } = useAuth();
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");
  const [density, setDensity] = useState(() => {
    try { return Math.min(CARD_GRID_CLASSES.length - 1, Math.max(0, Number(localStorage.getItem("plusticity:studio:density")) || 0)); }
    catch { return 0; }
  });
  const changeDensity = (next: number) => {
    const clamped = Math.min(CARD_GRID_CLASSES.length - 1, Math.max(0, next));
    setDensity(clamped);
    try { localStorage.setItem("plusticity:studio:density", String(clamped)); } catch { /* ignore */ }
  };
  const qc = useQueryClient();
  const { data } = useQuery({
    queryKey: ["studio-mine", user?.id],
    enabled: !!user,
    queryFn: async () => {
      if (!user) return [];
      return (
        (
          await supabase
            .from("studio_courses")
            .select(
              "id, title, published, category, cover_url, version_number, revision_of, studio_lessons(count), studio_modules(count)",
            )
            .eq("author_id", user.id)
            .order("updated_at", { ascending: false })
            .limit(200)
        ).data ?? []
      );
    },
  });
  return (
    <Phone>
      <Header />
      <Sheet wide>
        <div className="mb-4">
          <CanvasHeading eyebrow="For trainers" title="Course Studio" />
        </div>
        {ready && !user ? (
          <p className="py-10 text-center text-sm text-muted-foreground">
            <Link to="/auth" className="font-semibold text-primary">
              Sign in
            </Link>{" "}
            to create courses.
          </p>
        ) : (
          <>
            <p className="mb-4 text-sm text-muted-foreground">
              Create and edit courses here.
            </p>
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
              {user && <CourseWizard />}
              <Button asChild variant="outline">
                <Link to="/scorm">
                  <Package className="h-4 w-4" />
                  Upload SCORM
                </Link>
              </Button>
              <Button asChild variant="outline">
                <Link to="/studio/content-library">
                  <Library className="h-4 w-4" />
                  Content Library
                </Link>
              </Button>
            </div>
            <div className="mt-5 flex flex-wrap gap-3">
              <Input
                aria-label="Search your courses"
                placeholder="Search your courses"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="max-w-md"
              />
              <select
                aria-label="Course status"
                value={status}
                onChange={(e) => setStatus(e.target.value)}
                className="rounded-md border border-input bg-background px-3 py-2 text-sm"
              >
                <option value="all">All courses</option>
                <option value="draft">Drafts</option>
                <option value="published">Published</option>
                <option value="revision">Revisions</option>
              </select>
              <CourseViewToggle view={view} onChange={setView} />
              {view === "cards" && (
                <div role="group" aria-label="Card size" className="flex shrink-0 items-center gap-1">
                  <Button type="button" size="icon" variant="outline" aria-label="Zoom out — more, smaller cards" disabled={density === CARD_GRID_CLASSES.length - 1} onClick={() => changeDensity(density + 1)}>
                    <ZoomOut className="size-4" />
                  </Button>
                  <Button type="button" size="icon" variant="outline" aria-label="Zoom in — fewer, larger cards" disabled={density === 0} onClick={() => changeDensity(density - 1)}>
                    <ZoomIn className="size-4" />
                  </Button>
                </div>
              )}
            </div>
            <div className={view === "cards" ? `mt-5 grid gap-3 ${CARD_GRID_CLASSES[density]}` : "mt-5 grid gap-3"}>
              {(data ?? [])
                .filter(
                  (c) =>
                    c.title.toLowerCase().includes(search.toLowerCase()) &&
                    (status === "all" ||
                      (status === "published" && c.published) ||
                      (status === "draft" && !c.published) ||
                      (status === "revision" && !!c.revision_of)),
                )
                .map((c) => (
                  <article
                    key={c.id}
                    className={`min-w-0 overflow-hidden rounded-lg border border-border hover:bg-muted/50 ${view === "list" ? "flex items-center" : ""}`}
                  >
                    {c.cover_url ? (
                      <img
                        src={c.cover_url}
                        alt=""
                        className={view === "cards" ? "aspect-video w-full object-cover" : "aspect-video w-32 shrink-0 object-cover sm:w-44"}
                      />
                    ) : (
                      <div className={`grid aspect-video place-items-center bg-muted text-xs text-muted-foreground ${view === "cards" ? "w-full" : "w-32 shrink-0 sm:w-44"}`}>
                        No cover image
                      </div>
                    )}
                    <div className="min-w-0 flex-1 p-5">
                      <div className="flex items-start justify-between gap-2">
                        <Link
                          to="/studio/$id"
                          params={{ id: c.id }}
                          className="break-words font-semibold hover:text-primary"
                        >
                          {c.title}
                        </Link>
                        <StudioCourseActions
                          course={c}
                          onChanged={() => qc.invalidateQueries({ queryKey: ["studio-mine"] })}
                        />
                      </div>
                      <p className="mt-2 text-xs text-muted-foreground">
                        {c.category} ·{" "}
                        {(c.studio_modules as unknown as { count: number }[])[0]?.count ?? 0} modules
                        · {(c.studio_lessons as unknown as { count: number }[])[0]?.count ?? 0}{" "}
                        lessons
                      </p>
                      <Link to="/competencies/$courseId" params={{ courseId: c.revision_of ?? c.id }} className="mt-3 inline-block text-xs font-semibold text-primary">Competencies & assessment</Link>
                      <Link to="/gradebook/$courseId" params={{ courseId: c.revision_of ?? c.id }} className="ml-4 mt-3 inline-block text-xs font-semibold text-primary">Gradebook</Link>
                      <div className="mt-2 flex gap-2 text-[11px]">
                        <span
                          className={`rounded-full px-2 py-0.5 ${c.published ? "bg-secondary text-secondary-foreground" : "bg-muted text-muted-foreground"}`}
                        >
                          {c.published ? "Published" : c.revision_of ? "Draft revision" : "Draft"}
                        </span>
                        <span className="text-muted-foreground">v1.{c.version_number - 1}</span>
                      </div>
                    </div>
                  </article>
                ))}
              {data?.length === 0 && (
                <p className="col-span-full py-8 text-center text-sm text-muted-foreground">
                  No courses yet — click Create above to start.
                </p>
              )}
            </div>
          </>
        )}
      </Sheet>
    </Phone>
  );
}
