import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useLearning";
import { supabase } from "@/integrations/supabase/client";
import { readAllPages } from "@/lib/database-pages";
import { programRosterCsv } from "@/lib/programs";
import { friendlyError } from "@/lib/friendly-error";
import { Button } from "@/components/ui/button";

export function CohortProgramReports({ cohort }: { cohort: string }) {
  const { user } = useAuth();
  const [selected, setSelected] = useState("");
  const versions = useQuery({
    queryKey: ["cohort-programs", cohort, user?.id],
    queryFn: async () =>
      (
        await readAllPages(
          supabase
            .rpc("cohort_program_versions", { _cohort: cohort }, { count: "exact" })
            .order("title")
            .order("id"),
        )
      ).data,
  });
  return (
    <section className="space-y-3">
      <h2 className="font-semibold">Program reports</h2>
      {versions.isPending ? (
        <p>Loading programs…</p>
      ) : versions.isError ? (
        <p role="alert">Could not load cohort programs.</p>
      ) : (
        <select
          className="w-full rounded border p-2"
          aria-label="Cohort program report"
          value={selected}
          onChange={(e) => setSelected(e.target.value)}
        >
          <option value="">Choose an assigned program version</option>
          {versions.data.map((v) => (
            <option key={v.id} value={v.id}>
              {v.title} · Version {v.version}
              {v.active ? "" : " · Ended"}
            </option>
          ))}
        </select>
      )}
      {selected && <ProgramRoster key={cohort + selected} cohort={cohort} version={selected} />}
    </section>
  );
}
export function ProgramRoster({ cohort, version }: { cohort: string; version: string }) {
  const { user } = useAuth();
  const [page, setPage] = useState(0);
  const [busy, setBusy] = useState(false);
  const report = useQuery({
    queryKey: ["program-roster", cohort, version, page, user?.id],
    queryFn: async () => {
      const { data, error, count } = await supabase
        .rpc("cohort_program_progress", { _cohort: cohort, _version: version }, { count: "exact" })
        .order("full_name")
        .order("user_id")
        .range(page * 50, page * 50 + 49);
      if (error || count === null) throw error ?? new Error("Missing program report count");
      return { rows: data ?? [], count };
    },
  });
  const exportCsv = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const { data } = await readAllPages(
        supabase
          .rpc(
            "cohort_program_progress",
            { _cohort: cohort, _version: version },
            { count: "exact" },
          )
          .order("full_name")
          .order("user_id"),
      );
      const url = URL.createObjectURL(
        new Blob([programRosterCsv(data)], { type: "text/csv;charset=utf-8" }),
      );
      const a = document.createElement("a");
      a.href = url;
      a.download = "program-progress.csv";
      a.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      toast.error(friendlyError(error));
    } finally {
      setBusy(false);
    }
  };
  return (
    <section className="space-y-3 rounded-xl border p-4">
      <h2 className="font-semibold">Program cohort progress</h2>
      <Button variant="outline" disabled={busy} onClick={exportCsv}>
        Export full CSV
      </Button>
      {report.isPending ? (
        <p>Loading report…</p>
      ) : report.isError ? (
        <p role="alert">Could not load the scoped report.</p>
      ) : (
        <>
          <p className="text-xs">{report.data.count} current cohort members</p>
          {report.data.rows.map((row) => (
            <p className="text-sm" key={row.user_id}>
              {row.full_name} · {row.completed_stages}/{row.total_stages} stages ·{" "}
              {row.complete ? "Current requirements met" : "In progress or renewal needed"}
            </p>
          ))}
          <div className="flex gap-2">
            <Button variant="outline" disabled={!page} onClick={() => setPage(page - 1)}>
              Previous
            </Button>
            <Button
              variant="outline"
              disabled={(page + 1) * 50 >= report.data.count}
              onClick={() => setPage(page + 1)}
            >
              Next
            </Button>
          </div>
        </>
      )}
    </section>
  );
}
