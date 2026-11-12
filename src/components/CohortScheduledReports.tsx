import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useConfirm } from "@/components/ConfirmDialog";
import { useAuth } from "@/hooks/useLearning";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import { friendlyError } from "@/lib/friendly-error";
import { cohortSnapshotCsv } from "@/lib/cohort-snapshot";

type Schedule = Database["public"]["Tables"]["cohort_report_schedules"]["Row"];
type Props = { cohortId: string; organizationId: string };
const statusSchema = z.object({ scheduled: z.boolean(), last_status: z.string().nullable() });
export function CohortScheduledReports(props: Props) {
  const { user } = useAuth();
  const query = useQuery({
    queryKey: ["cohort-report-schedule", props.cohortId, user?.id],
    refetchInterval: 30000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("cohort_report_schedules")
        .select("*")
        .eq("cohort_id", props.cohortId)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });
  return (
    <section className="space-y-3 rounded border p-3">
      <h3 className="font-semibold">Saved progress reports</h3>
      {query.isPending ? (
        <p>Loading report settings…</p>
      ) : query.isError ? (
        <p role="alert">
          Could not load report settings.{" "}
          <Button variant="outline" onClick={() => query.refetch()}>
            Retry
          </Button>
        </p>
      ) : (
        <ReportControls {...props} schedule={query.data} />
      )}
    </section>
  );
}
function ReportControls({
  cohortId,
  organizationId,
  schedule,
}: Props & { schedule: Schedule | null }) {
  const { user } = useAuth();
  const confirm = useConfirm();
  const qc = useQueryClient();
  const [enabled, setEnabled] = useState(schedule?.enabled ?? false);
  const [interval, setInterval] = useState(schedule?.interval_minutes ?? 1440);
  const [version, setVersion] = useState(schedule?.version ?? 0);
  const [request, setRequest] = useState(() => crypto.randomUUID());
  const [busy, setBusy] = useState(false);
  const changed = version !== (schedule?.version ?? 0);
  const health = useQuery({
    queryKey: ["company-report-scheduler", organizationId, user?.id],
    refetchInterval: 30000,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("company_report_scheduler_status", {
        _organization: organizationId,
      });
      if (error) throw error;
      return statusSchema.parse(data);
    },
  });
  const history = useQuery({
    queryKey: ["company-report-history", cohortId, user?.id],
    refetchInterval: 30000,
    queryFn: async () => {
      const { data, error } = await supabase
        .rpc("company_cohort_report_history", { _cohort: cohortId })
        .order("created_at", { ascending: false })
        .order("id")
        .limit(30);
      if (error) throw error;
      return data;
    },
  });
  const refresh = () =>
    Promise.all([
      qc.invalidateQueries({ queryKey: ["cohort-report-schedule", cohortId] }),
      qc.invalidateQueries({ queryKey: ["company-report-history", cohortId] }),
    ]);
  const perform = async (action: () => Promise<void>) => {
    if (busy) return;
    setBusy(true);
    try {
      await action();
    } catch (error) {
      toast.error(friendlyError(error));
    } finally {
      setBusy(false);
    }
  };
  const save = () =>
    perform(async () => {
      if (
        !(await confirm({
          title: enabled
            ? "Schedule saved progress reports?"
            : "Save report settings with scheduling paused?",
          description:
            "Reports include learner names and training progress. Current workspace managers can download them here. Keep up to 30 reports for 30 days. Email delivery is not configured.",
          confirmLabel: "Save report settings",
        }))
      )
        return;
      const { data, error } = await supabase.rpc("save_cohort_report_schedule", {
        _cohort: cohortId,
        _enabled: enabled,
        _interval: interval,
        _expected: version,
      });
      if (error) throw error;
      setVersion(data);
      await refresh();
      toast.success("Report settings saved.");
    });
  const generate = () =>
    perform(async () => {
      if (
        !(await confirm({
          title: "Save a progress report now?",
          description:
            "This records current progress, deadlines, payment access and current certificates for this group's assigned courses. Older snapshots retain their recorded values.",
          confirmLabel: "Generate report",
        }))
      )
        return;
      const { error } = await supabase.rpc("generate_cohort_report_snapshot", {
        _cohort: cohortId,
        _request: request,
      });
      if (error) throw error;
      setRequest(crypto.randomUUID());
      await refresh();
      toast.success("Progress report saved.");
    });
  const download = (id: string) =>
    perform(async () => {
      const { data, error } = await supabase.rpc("company_cohort_report_snapshot", { _report: id });
      if (error) throw error;
      const csv = cohortSnapshotCsv(data);
      const url = URL.createObjectURL(
        new Blob(["\uFEFF", csv], { type: "text/csv;charset=utf-8" }),
      );
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `saved-progress-${id}.csv`;
      anchor.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    });
  return (
    <div className="space-y-3">
      <p className="text-sm">
        Save course progress at regular intervals or on demand. Current workspace managers can
        download historical CSV reports. Up to 30 reports are retained for 30 days, with a
        10,000-row limit per report. Email delivery is deferred.
      </p>
      <p className="text-sm">
        {health.isError
          ? "Schedule status unavailable."
          : !health.data
            ? "Checking report scheduler…"
            : !health.data.scheduled
              ? "Automatic reports unavailable. Generate a report manually."
              : health.data.last_status === "failed"
                ? "The latest report scheduler check failed."
                : health.data.last_status === "succeeded"
                  ? "Report scheduler is running."
                  : "Report scheduler active; awaiting its first check."}
      </p>
      {changed && (
        <p role="alert">
          Report settings changed.{" "}
          <Button
            variant="outline"
            disabled={busy}
            onClick={() => {
              setVersion(schedule?.version ?? 0);
              setEnabled(schedule?.enabled ?? false);
              setInterval(schedule?.interval_minutes ?? 1440);
            }}
          >
            Reload settings
          </Button>
        </p>
      )}
      <fieldset disabled={busy || changed} className="space-y-3">
        <label className="flex items-center gap-2">
          <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} />
          Generate reports automatically
        </label>
        <label className="block">
          Interval (minutes, 60–43,200)
          <input
            className="ml-2 rounded border p-2"
            type="number"
            min={60}
            max={43200}
            value={interval}
            onChange={(e) => setInterval(Number(e.target.value))}
          />
        </label>
      </fieldset>
      <div className="flex flex-wrap gap-2">
        <Button
          disabled={
            busy ||
            changed ||
            !Number.isInteger(interval) ||
            interval < 60 ||
            interval > 43200 ||
            (enabled && !health.data?.scheduled)
          }
          onClick={save}
        >
          Save report settings
        </Button>
        <Button variant="outline" disabled={busy} onClick={generate}>
          Generate report now
        </Button>
      </div>
      {schedule && (
        <p className="text-sm">
          Version {schedule.version} ·{" "}
          {schedule.enabled
            ? `Scheduled; next due ${new Date(schedule.next_run).toLocaleString()}`
            : "Paused"}
          {schedule.last_run &&
            ` · Last generation: ${new Date(schedule.last_run).toLocaleString()} (${schedule.last_status})`}
          . A busy queue may delay generation.
        </p>
      )}
      {history.isPending ? (
        <p>Loading saved reports…</p>
      ) : history.isError ? (
        <p role="alert">Could not load saved reports.</p>
      ) : history.data.length === 0 ? (
        <p>No saved reports yet.</p>
      ) : (
        <ul className="space-y-2">
          {history.data.map((report) => (
            <li
              className="flex flex-wrap items-center justify-between gap-2 border-b py-2"
              key={report.id}
            >
              <span>
                {new Date(report.created_at).toLocaleString()} ·{" "}
                {report.scheduled ? `Scheduled (version ${report.schedule_version})` : "On demand"}{" "}
                · {report.rows} rows
              </span>
              <Button variant="outline" disabled={busy} onClick={() => download(report.id)}>
                Download CSV
              </Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
