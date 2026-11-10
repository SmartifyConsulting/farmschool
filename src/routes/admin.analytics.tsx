import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { BarChart3 } from "lucide-react";
import { useAuth } from "@/hooks/useLearning";
import { supabase } from "@/integrations/supabase/client";
import { Phone, Header, Sheet, CanvasHeading } from "@/components/AppShell";
import { friendlyError } from "@/lib/friendly-error";
import { getPlatformAnalytics } from "@/lib/admin-analytics.functions";
import { pageMeta } from "@/lib/page-meta";

export const Route = createFileRoute("/admin/analytics")({
  component: PlatformAnalytics,
  head: () =>
    pageMeta(
      "Platform analytics — Mobile School",
      "Learner activity and SCORM completion across every course.",
    ),
});

function PlatformAnalytics() {
  const { user, ready } = useAuth();
  const fetchStats = useServerFn(getPlatformAnalytics);
  const { data: isAdmin, isLoading: checking } = useQuery({
    queryKey: ["platform-analytics-admin", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("has_role", {
        _user_id: user!.id,
        _role: "admin",
      });
      if (error) throw error;
      return data === true;
    },
  });
  const { data, error, isLoading } = useQuery({
    queryKey: ["platform-analytics"],
    enabled: !!isAdmin,
    queryFn: () => fetchStats(),
  });
  return (
    <Phone>
      <Header />
      <Sheet>
        <CanvasHeading eyebrow="Platform management" title="Analytics" />
        {!ready || (user && checking) ? (
          <p className="py-8 text-sm text-muted-foreground">Checking permissions…</p>
        ) : !user ? (
          <p className="py-8 text-sm">
            <Link to="/auth" className="font-semibold text-primary">
              Sign in
            </Link>{" "}
            to access administration.
          </p>
        ) : !isAdmin ? (
          <p className="py-8 text-sm text-muted-foreground">Administrator access required.</p>
        ) : (
          <div className="max-w-3xl space-y-4 pb-10">
            <Link to="/admin" className="text-sm font-semibold text-primary">
              ← Administration
            </Link>
            {isLoading && (
              <p className="text-sm text-muted-foreground">Loading platform activity…</p>
            )}
            {error && <p className="text-sm text-destructive">{friendlyError(error)}</p>}
            {data && (
              <>
                <div className="grid grid-cols-2 gap-2 text-center sm:grid-cols-4">
                  {[
                    ["Courses", data.totals.courses],
                    ["Published", data.totals.publishedCourses],
                    ["Learners", data.totals.learners],
                    [
                      "Avg quiz score",
                      data.totals.avgScore === null ? "—" : `${data.totals.avgScore}%`,
                    ],
                    ["Certificates", data.totals.certificates],
                    ["SCORM attempts", data.totals.scormAttempts],
                    [
                      "SCORM completion",
                      data.totals.scormCompletionRate === null
                        ? "—"
                        : `${data.totals.scormCompletionRate}%`,
                    ],
                    [
                      "SCORM avg score",
                      data.totals.scormAvgScore === null ? "—" : `${data.totals.scormAvgScore}%`,
                    ],
                  ].map(([label, value]) => (
                    <div key={label} className="rounded-xl bg-muted/50 p-3">
                      <p className="text-lg font-semibold">{value}</p>
                      <p className="text-[11px] text-muted-foreground">{label}</p>
                    </div>
                  ))}
                </div>
                <section aria-labelledby="by-course" className="space-y-2">
                  <h2 id="by-course" className="flex items-center gap-2 font-semibold">
                    <BarChart3 className="h-4 w-4 text-primary" />
                    By course
                  </h2>
                  {data.courses.length === 0 && (
                    <p className="text-sm text-muted-foreground">No courses yet.</p>
                  )}
                  {data.courses.map((course) => (
                    <div key={course.id} className="rounded-xl border border-border p-3 text-sm">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-semibold">{course.title}</span>
                        <span className="text-xs text-muted-foreground">
                          {course.published ? "Published" : "Draft"}
                        </span>
                      </div>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {course.learners} learners · {course.completionRate}% completion
                        {course.avgScore !== null && ` · avg score ${course.avgScore}%`}
                      </p>
                      <div className="mt-2 h-1.5 rounded-full bg-muted">
                        <div
                          className="h-1.5 rounded-full bg-primary"
                          style={{ width: `${course.completionRate}%` }}
                        />
                      </div>
                    </div>
                  ))}
                </section>
              </>
            )}
          </div>
        )}
      </Sheet>
    </Phone>
  );
}
