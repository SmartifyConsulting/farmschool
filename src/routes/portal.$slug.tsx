import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Phone, Header, Sheet, CanvasHeading, ProgressBar } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/hooks/useLearning";
import { useCustomerPortal } from "@/hooks/useCustomerPortal";
import { portalCourseReport, readPortalSlug } from "@/lib/customer-portal";
import { pageMeta } from "@/lib/page-meta";
import { supabase } from "@/integrations/supabase/client";
import { formatPrice } from "@/lib/marketplace";
import { CourseViewToggle, useCourseView } from "@/components/CourseViewToggle";
import { PortalCertificates } from "@/components/PortalCertificates";
import { PortalPrograms } from "@/components/PortalPrograms";

export const Route = createFileRoute("/portal/$slug")({
  validateSearch: (
    input: Record<string, unknown>,
  ): { view?: "catalogue" | "learning" | "certificates" | "programs" } =>
    input["view"] === "catalogue" ||
    input["view"] === "learning" ||
    input["view"] === "certificates" ||
    input["view"] === "programs"
      ? { view: input["view"] }
      : {},
  head: () => pageMeta("Training portal", "Sign in to your organization's training portal."),
  component: PortalPage,
});
function PortalPage() {
  const { slug: parameter } = Route.useParams();
  const slug = readPortalSlug(parameter);
  const portal = useCustomerPortal(slug);
  const { user, ready } = useAuth();
  const { view = "learning" } = Route.useSearch();
  return (
    <Phone>
      <Header />
      <Sheet wide>
        {!slug ? (
          <p role="alert">This training portal is unavailable.</p>
        ) : portal.isPending ? (
          <p>Loading training portal…</p>
        ) : portal.isError || !portal.data ? (
          <p role="alert">This training portal is unavailable.</p>
        ) : (
          <>
            <CanvasHeading eyebrow="Training portal" title={portal.data.brand.name} />
            <p className="mb-5 whitespace-pre-wrap">{portal.data.message}</p>
            {!ready ? (
              <p>Checking your account…</p>
            ) : !user ? (
              <div className="space-y-3">
                <p>Sign in with the account your training manager added to this portal.</p>
                <Button asChild>
                  <Link to="/auth" search={{ portal: slug }}>
                    Sign in
                  </Link>
                </Button>
              </div>
            ) : view === "certificates" ? (
              <PortalCertificates key={slug + ":" + user.id} slug={slug} />
            ) : view === "programs" ? (
              <PortalPrograms key={slug + ":" + user.id} slug={slug} />
            ) : (
              <PortalCourses key={slug + ":" + view + ":" + user.id} slug={slug} view={view} />
            )}
          </>
        )}
      </Sheet>
    </Phone>
  );
}
function PortalCourses({ slug, view }: { slug: string; view: "catalogue" | "learning" }) {
  const { user } = useAuth();
  const [page, setPage] = useState(0);
  const [query, setQuery] = useState("");
  const [draft, setDraft] = useState("");
  const [display, setDisplay] = useCourseView(
    "portal:" + slug + ":" + view,
    view === "learning" ? "list" : "cards",
  );
  const report = useQuery({
    queryKey: ["portal-courses", user?.id, slug, view, query, page],
    refetchInterval: 30000,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("portal_course_report", {
        _slug: slug,
        _learning: view === "learning",
        _query: query,
        _offset: page * 24,
        _limit: 24,
      });
      if (error) throw error;
      return portalCourseReport.parse(data);
    },
  });
  return (
    <div className="space-y-5">
      <nav className="flex flex-wrap gap-3" aria-label="Portal learning">
        <Button asChild variant={view === "learning" ? "default" : "outline"}>
          <Link to="/portal/$slug" params={{ slug }} search={{ view: "learning" }}>
            My Learning
          </Link>
        </Button>
        <Button asChild variant={view === "catalogue" ? "default" : "outline"}>
          <Link to="/portal/$slug" params={{ slug }} search={{ view: "catalogue" }}>
            Catalogue
          </Link>
        </Button>
        {report.data?.can_manage && (
          <Button asChild variant="outline">
            <Link to="/organizations/$id" params={{ id: report.data.organization_id }}>
              Manage training
            </Link>
          </Button>
        )}
      </nav>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <form
          className="flex flex-1 gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            setQuery(draft.trim());
            setPage(0);
          }}
        >
          <Input
            value={draft}
            maxLength={200}
            onChange={(event) => setDraft(event.target.value)}
            aria-label="Search this training portal"
            placeholder="Search training"
          />
          <Button type="submit" variant="outline">
            Search
          </Button>
        </form>
        <CourseViewToggle view={display} onChange={setDisplay} />
      </div>
      {report.isPending ? (
        <p>Loading your training…</p>
      ) : report.isError ? (
        <div role="alert" className="space-y-3">
          <p>
            This account cannot load the portal's training. Your training manager may need to add
            your account, or the connection may be unavailable.
          </p>
          <Button variant="outline" onClick={() => report.refetch()}>
            Retry
          </Button>
          <Button variant="outline" onClick={() => supabase.auth.signOut()}>
            Use another account
          </Button>
        </div>
      ) : (
        <>
          <p className="text-sm text-muted-foreground">
            {report.data.total}{" "}
            {view === "learning"
              ? "assigned, enrolled or recorded courses"
              : "courses in this training portal"}
          </p>
          <div
            className={
              display === "cards" ? "grid gap-4 sm:grid-cols-2 lg:grid-cols-3" : "space-y-3"
            }
          >
            {report.data.records.map((course) => (
              <article
                key={course.id}
                className={
                  display === "cards"
                    ? "space-y-3 rounded-xl border p-4"
                    : "flex flex-wrap items-center justify-between gap-4 rounded-xl border p-4"
                }
              >
                <div className="min-w-0 flex-1">
                  <h2 className="font-semibold">{course.title}</h2>
                  <p className="line-clamp-3 text-sm text-muted-foreground">{course.description}</p>
                  <p className="mt-2 text-sm">
                    {course.assigned ? "Assigned · " : ""}
                    {course.certified ? "Certificate current · " : ""}
                    {course.price_cents > 0
                      ? formatPrice(course.price_cents, course.currency)
                      : "Free training"}
                  </p>
                  <ProgressBar
                    pct={
                      course.total_lessons
                        ? Math.min(
                            100,
                            Math.round((course.completed_lessons / course.total_lessons) * 100),
                          )
                        : 0
                    }
                    label={`${course.completed_lessons} of ${course.total_lessons} lessons completed`}
                  />
                </div>
                <Button asChild variant={course.access ? "default" : "outline"}>
                  <Link to="/class/$id" params={{ id: course.id }} search={{ portal: slug }}>
                    {course.access ? "Open course" : "View requirements"}
                  </Link>
                </Button>
              </article>
            ))}
          </div>
          <div className="flex items-center gap-3">
            <Button variant="outline" disabled={page === 0} onClick={() => setPage(page - 1)}>
              Previous
            </Button>
            <span>Page {page + 1}</span>
            <Button
              variant="outline"
              disabled={(page + 1) * 24 >= report.data.total}
              onClick={() => setPage(page + 1)}
            >
              Next
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
