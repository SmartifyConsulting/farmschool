import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { Phone, Header, Sheet, CanvasHeading } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useLearning";
import { readAllPages } from "@/lib/database-pages";
import { cohortReport, cohortReportCsv } from "@/lib/cohort-report";
import { friendlyError } from "@/lib/friendly-error";
import { pageMeta } from "@/lib/page-meta";
import { CohortProgramReports } from "@/components/ProgramRoster";

export const Route = createFileRoute("/cohorts")({
  component: CohortReports,
  head: () =>
    pageMeta("Cohort reports — Plusticity", "View progress for the learner groups you manage."),
});
function CohortReports() {
  const { user, ready } = useAuth();
  const [selected, setSelected] = useState("");
  const [page, setPage] = useState(0);
  const [exporting, setExporting] = useState(false);
  const cohorts = useQuery({
    queryKey: ["report-cohorts", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data } = await readAllPages(
        supabase
          .rpc("my_reporting_cohorts", undefined, { count: "exact" })
          .order("name")
          .order("id"),
      );
      return data;
    },
  });
  const report = useQuery({
    queryKey: ["cohort-progress", user?.id, selected, page],
    enabled: !!user && !!selected,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("cohort_progress_report", {
        _cohort: selected,
        _offset: page * 50,
        _limit: 50,
      });
      if (error) throw error;
      return cohortReport.parse(data);
    },
  });
  const exportAll = async () => {
    if (exporting || !selected) return;
    setExporting(true);
    try {
      const { data, error } = await supabase.rpc("cohort_progress_export", { _cohort: selected });
      if (error) throw error;
      const complete = cohortReport.parse(data);
      if (complete.total !== complete.records.length)
        throw new Error("Could not load the complete cohort export.");
      const url = URL.createObjectURL(
        new Blob(["\uFEFF", cohortReportCsv(complete)], { type: "text/csv;charset=utf-8" }),
      );
      const link = document.createElement("a");
      link.href = url;
      link.download = `cohort-${selected}.csv`;
      link.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      toast.error(friendlyError(error));
    } finally {
      setExporting(false);
    }
  };
  return (
    <Phone>
      <Header />
      <Sheet wide>
        <CanvasHeading eyebrow="For managers" title="Cohort reports" />
        {!ready ? (
          <p>Checking access…</p>
        ) : !user ? (
          <Link to="/auth">Sign in</Link>
        ) : (
          <div className="mt-4 space-y-4">
            <p className="text-sm text-muted-foreground">
              Reporting access is limited to cohorts assigned to you by their administrator. Payment
              access and completion are separate; course prerequisites still apply.
            </p>
            {cohorts.isError && <p role="alert">Could not load your cohorts.</p>}
            <select
              aria-label="Cohort report"
              className="w-full rounded-md border bg-background p-2"
              value={selected}
              onChange={(e) => {
                setSelected(e.target.value);
                setPage(0);
              }}
            >
              <option value="">Choose a cohort</option>
              {cohorts.data?.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </select>
            {selected && <CohortProgramReports key={selected} cohort={selected} />}
            {selected &&
              (report.isPending ? (
                <p>Loading progress…</p>
              ) : report.isError ? (
                <p role="alert">
                  Could not load this report. Ask the cohort administrator for reporting access.
                </p>
              ) : (
                <>
                  <div className="flex flex-wrap items-center gap-4">
                    <h2 className="font-semibold">{report.data.name}</h2>
                    <Button
                      variant="outline"
                      disabled={exporting || !report.data.total}
                      onClick={exportAll}
                    >
                      {exporting ? "Preparing…" : "Export whole cohort (CSV)"}
                    </Button>
                  </div>
                  <div className="overflow-x-auto rounded-lg border">
                    <table className="w-full text-left text-sm">
                      <thead>
                        <tr>
                          {[
                            "Learner",
                            "Course",
                            "Deadline",
                            "Lessons",
                            "Certified",
                            "Payment access",
                          ].map((title) => (
                            <th key={title} className="p-3">
                              {title}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {report.data.records.map((item) => (
                          <tr key={item.user_id + item.course_id} className="border-t">
                            <th scope="row" className="p-3">
                              {item.learner_name}
                            </th>
                            <td className="p-3">{item.course_title}</td>
                            <td className="p-3">
                              {item.due_at ? new Date(item.due_at).toLocaleString() : "No deadline"}
                            </td>
                            <td className="p-3">
                              {item.completed_lessons}/{item.total_lessons}
                            </td>
                            <td className="p-3">{item.certified ? "Yes" : "No"}</td>
                            <td className="p-3">
                              {item.payment_access
                                ? "Yes"
                                : "Purchase required or course unavailable"}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  {!report.data.records.length && (
                    <p>No assigned learner/course pairs on this page.</p>
                  )}
                  <div className="flex items-center gap-3">
                    <Button
                      variant="outline"
                      disabled={page === 0}
                      onClick={() => setPage(page - 1)}
                    >
                      Previous
                    </Button>
                    <span className="text-sm">
                      Page {page + 1} · {report.data.total} learner/course pairs
                    </span>
                    <Button
                      variant="outline"
                      disabled={(page + 1) * 50 >= report.data.total}
                      onClick={() => setPage(page + 1)}
                    >
                      Next
                    </Button>
                  </div>
                </>
              ))}
          </div>
        )}
      </Sheet>
    </Phone>
  );
}
