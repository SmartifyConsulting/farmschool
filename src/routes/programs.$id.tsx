import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { Phone, Header, Sheet, CanvasHeading } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useLearning";
import { supabase } from "@/integrations/supabase/client";
import { programProgress } from "@/lib/programs";
import { friendlyError } from "@/lib/friendly-error";
import { pageMeta } from "@/lib/page-meta";
import { portalSearch } from "@/lib/customer-portal";

export const Route = createFileRoute("/programs/$id")({
  validateSearch: portalSearch,
  component: ProgramPage,
  head: () =>
    pageMeta("Learning program — Plusticity", "Your program stages and completion record."),
});
function ProgramPage() {
  const { id } = Route.useParams();
  const { portal } = Route.useSearch();
  const { user, ready } = useAuth();
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);
  const result = useQuery({
    queryKey: ["my-program", id, user?.id, portal],
    enabled: !!user,
    refetchInterval: 30000,
    queryFn: async () => {
      const { data, error } = portal ? await supabase.rpc("portal_program_progress", { _slug: portal, _version: id }) : await supabase.rpc("my_program_progress", { _version: id });
      if (error) throw error;
      return data === null ? null : programProgress.parse(data);
    },
  });
  const claim = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const { error } = portal ? await supabase.rpc("claim_portal_program_award", { _slug: portal, _version: id }) : await supabase.rpc("claim_program_award", { _version: id });
      if (error) throw error;
      await qc.invalidateQueries({ queryKey: ["my-program", id] });
      toast.success("Program completion recorded.");
    } catch (error) {
      toast.error(
        friendlyError(
          error,
          "Could not record program completion. Check your current certificates and cohort assignment.",
        ),
      );
    } finally {
      setBusy(false);
    }
  };
  return (
    <Phone>
      <Header />
      <Sheet>
        <CanvasHeading title={result.data?.title ?? "Learning program"} />
        {!ready ? (
          <p>Checking sign-in…</p>
        ) : !user ? (
          <Link to="/auth" search={portal ? { portal } : {}}>Sign in to view this program</Link>
        ) : result.isPending ? (
          <p>Loading program…</p>
        ) : result.isError ? (
          <p role="alert">Could not load this program.</p>
        ) : !result.data ? (
          <p>This program is unavailable or your cohort assignment has ended.</p>
        ) : (
          <div className="space-y-5">
            <p className="whitespace-pre-wrap">{result.data.description}</p>
            <p className="text-sm">
              Program version {result.data.version}. Earn current verified course certificates to
              meet each stage. Later stages are suggested after earlier stages; individual course
              prerequisites and paid access still apply.
            </p>
            {result.data.stages.map((stage, index) => (
              <section className="space-y-3 rounded-xl border p-4" key={index}>
                <h2 className="font-semibold">
                  {index + 1}. {stage.title}
                </h2>
                <p className="text-sm">
                  Complete {stage.required} of {stage.courses.length} courses · {stage.completed}{" "}
                  currently certified{stage.unlocked ? "" : " · Finish the earlier stages first"}
                </p>
                {stage.courses.map((course) => (
                  <div className="flex flex-wrap justify-between gap-2 text-sm" key={course.id}>
                    <span>
                      {course.title} ·{" "}
                      {course.complete ? "Current certificate" : "Certificate needed"}
                    </span>
                    {stage.unlocked && course.published ? (
                      <Link
                        className="text-primary underline"
                        to="/class/$id"
                        params={{ id: course.id }}
                        search={portal ? { portal } : {}}
                      >
                        Open course
                      </Link>
                    ) : !course.published ? (
                      <span>Course unavailable; contact your trainer</span>
                    ) : null}
                  </div>
                ))}
              </section>
            ))}
            <Button type="button" disabled={busy || result.isError || !result.data.complete} onClick={claim}>
              Record program completion
            </Button>
            <h2 className="font-semibold">Program completion history</h2>
            {!result.data.awards.length && <p>No completion recorded yet.</p>}
            {result.data.awards.map((a) => (
              <article className="space-y-2 rounded-xl border p-4" key={a.id}>
                <p>
                  {result.data!.title} · Program version {result.data!.version}
                </p>
                <p>
                  Recorded {new Date(a.issued_at).toLocaleDateString()}
                  {a.expires_at
                    ? ` · Original validity until ${new Date(a.expires_at).toLocaleDateString()}`
                    : ""}
                </p>
                <p className="break-all text-xs">Record {a.id}</p>
                <p className="text-xs">
                  This is a historical program completion. Current requirements are shown above and
                  depend on course certificate validity and revocation.
                </p>
              </article>
            ))}
          </div>
        )}
      </Sheet>
    </Phone>
  );
}
