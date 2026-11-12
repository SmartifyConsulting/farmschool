import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useLearning";
import { useConfirm } from "@/components/ConfirmDialog";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import { friendlyError } from "@/lib/friendly-error";
import {
  assignmentRuleCriteria,
  assignmentRulePreview,
  assignmentRuleResult,
  assignmentRuleChangesCsv,
} from "@/lib/cohort-rules";

type Rule = Database["public"]["Tables"]["cohort_assignment_rules"]["Row"];
type Props = { cohortId: string; organizationId: string };
const criteria = (rule: Rule | null) => ({
  department: rule?.department_id ?? null,
  descendants: rule?.include_descendants ?? true,
  job: rule?.job_contains ?? null,
  role: rule?.role_filter ?? "learner",
  addOnly: rule?.add_only ?? true,
  interval: rule?.interval_minutes ?? 60,
});
const healthSchema = z.object({
  scheduled: z.boolean(),
  last_run: z.string().nullable(),
  last_cron_status: z.string().nullable().optional(),
});

export function CohortAssignmentRules(props: Props) {
  const { user } = useAuth();
  const query = useQuery({
    queryKey: ["cohort-assignment-rule", props.cohortId, user?.id],
    refetchInterval: 30000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("cohort_assignment_rules")
        .select("*")
        .eq("cohort_id", props.cohortId)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });
  return (
    <section className="space-y-3 rounded border p-3">
      <h3 className="font-semibold">Automatic group membership</h3>
      {query.isPending ? (
        <p>Loading assignment rule…</p>
      ) : query.isError ? (
        <p role="alert">
          Could not load the assignment rule.{" "}
          <Button variant="outline" onClick={() => query.refetch()}>
            Retry
          </Button>
        </p>
      ) : (
        <RuleEditor {...props} rule={query.data} />
      )}
    </section>
  );
}

function RuleEditor({ cohortId, organizationId, rule }: Props & { rule: Rule | null }) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const confirm = useConfirm();
  const [form, setForm] = useState(() => criteria(rule));
  const [version, setVersion] = useState(rule?.version ?? 0);
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState<z.infer<typeof assignmentRulePreview> | null>(null);
  const [request, setRequest] = useState("");
  const [exclusionPage, setExclusionPage] = useState(0);
  const [historyPage, setHistoryPage] = useState(0);
  const changed = version !== (rule?.version ?? 0);
  const dirty =
    JSON.stringify({ ...form, job: form.job?.trim() || null }) !== JSON.stringify(criteria(rule));
  const health = useQuery({
    queryKey: ["organization-automation", organizationId, user?.id],
    refetchInterval: 30000,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("organization_automation_status", {
        _organization: organizationId,
      });
      if (error) throw error;
      return healthSchema.parse(data);
    },
  });
  const departments = useQuery({
    queryKey: ["rule-departments", organizationId, user?.id],
    queryFn: async () => {
      const rows: { id: string; name: string }[] = [];
      for (let page = 0; ; page++) {
        const { data, error } = await supabase
          .from("organization_departments")
          .select("id,name")
          .eq("organization_id", organizationId)
          .order("id")
          .range(page * 500, page * 500 + 499);
        if (error) throw error;
        rows.push(...data);
        if (data.length < 500) return rows;
      }
    },
  });
  const exclusions = useQuery({
    queryKey: ["cohort-rule-exclusions", cohortId, user?.id, exclusionPage],
    queryFn: async () => {
      const { data, error, count } = await supabase
        .rpc("cohort_rule_excluded_people", { _cohort: cohortId }, { count: "exact" })
        .order("excluded_at", { ascending: false })
        .order("user_id")
        .range(exclusionPage * 20, exclusionPage * 20 + 19);
      if (error) throw error;
      return { rows: data, count: count ?? 0 };
    },
  });
  const history = useQuery({
    queryKey: ["cohort-rule-history", cohortId, user?.id, historyPage],
    refetchInterval: 30000,
    queryFn: async () => {
      const { data, error, count } = await supabase
        .rpc("cohort_assignment_rule_history", { _cohort: cohortId }, { count: "exact" })
        .order("created_at", { ascending: false })
        .order("request_id")
        .range(historyPage * 10, historyPage * 10 + 9);
      if (error) throw error;
      return { rows: data, count: count ?? 0 };
    },
  });
  const refresh = () =>
    Promise.all([
      qc.invalidateQueries({ queryKey: ["cohort-assignment-rule", cohortId] }),
      qc.invalidateQueries({ queryKey: ["cohort-rule-exclusions", cohortId] }),
      qc.invalidateQueries({ queryKey: ["cohort-rule-history", cohortId] }),
      qc.invalidateQueries({ queryKey: ["organization-training", organizationId] }),
      qc.invalidateQueries({ queryKey: ["organization-cohort-members"] }),
    ]);
  const perform = async (action: () => Promise<void>) => {
    if (busy) return;
    setBusy(true);
    try {
      await action();
    } catch (error) {
      setPreview(null);
      toast.error(friendlyError(error));
    } finally {
      setBusy(false);
    }
  };
  const save = () =>
    perform(async () => {
      const parsed = assignmentRuleCriteria.parse(form);
      if (
        !(await confirm({
          title: "Save this rule paused?",
          description:
            "Preview the matching people before applying changes or enabling automatic updates. Saving pauses any existing schedule.",
          confirmLabel: "Save paused rule",
        }))
      )
        return;
      const { data, error } = await supabase.rpc("save_cohort_assignment_rule", {
        _cohort: cohortId,
        _department: parsed.department,
        _descendants: parsed.descendants,
        _job: parsed.job,
        _role: parsed.role,
        _add_only: parsed.addOnly,
        _enabled: false,
        _interval: parsed.interval,
        _expected: version,
      });
      if (error) throw error;
      setVersion(data);
      setPreview(null);
      await refresh();
      toast.success("Rule saved and paused.");
    });
  const getPreview = () =>
    perform(async () => {
      const { data, error } = await supabase.rpc("preview_cohort_assignment_rule", {
        _cohort: cohortId,
        _expected: version,
      });
      if (error) throw error;
      setPreview(assignmentRulePreview.parse(data));
      setRequest(crypto.randomUUID());
    });
  const schedule = (enabled: boolean) =>
    perform(async () => {
      if (
        !(await confirm({
          title: enabled
            ? "Enable automatic membership updates?"
            : "Pause automatic membership updates?",
          description: enabled
            ? "The saved criteria will continue changing this group as company records change. Paid course licences must still be allocated separately."
            : "Current memberships remain in place.",
          confirmLabel: enabled ? "Enable schedule" : "Pause schedule",
        }))
      )
        return;
      const { data, error } = await supabase.rpc("set_cohort_assignment_schedule", {
        _cohort: cohortId,
        _expected: version,
        _enabled: enabled,
        _hash: enabled ? (preview?.hash ?? null) : null,
      });
      if (error) throw error;
      setVersion(data);
      setPreview(null);
      await refresh();
    });
  const apply = () =>
    perform(async () => {
      if (
        !preview ||
        !(await confirm({
          title: "Apply the previewed membership changes?",
          description: `Add ${preview.add} and remove ${preview.remove}. Removed people retain permanently consumed named licences; removal does not free paid seats.`,
          confirmLabel: "Apply changes",
        }))
      )
        return;
      const { data, error } = await supabase.rpc("run_cohort_assignment_rule", {
        _cohort: cohortId,
        _expected: version,
        _hash: preview.hash,
        _request: request,
      });
      if (error) throw error;
      const result = assignmentRuleResult.parse(data);
      if (result.status === "applied") {
        setPreview(null);
        await refresh();
        toast.success(`Added ${result.added}; removed ${result.removed}.`);
      } else toast.info("Another update is running. Preview again shortly.");
    });
  const edit = (change: Partial<typeof form>) => {
    setForm({ ...form, ...change });
    setPreview(null);
  };
  const clean = !!rule && !dirty && !changed;
  return (
    <div className="space-y-3">
      <p className="text-sm">
        Match company-managed department, job title and workspace role. Manual members stay in the
        group. Manual removals are excluded until you allow them again. Paid course licences are
        allocated separately.
      </p>
      <p className="text-sm">
        {health.isError
          ? "Schedule status unavailable."
          : !health.data
            ? "Checking scheduler…"
            : !health.data.scheduled
              ? "Automatic scheduling is unavailable; manual previews and updates still work."
              : health.data.last_cron_status === "failed"
                ? "The last scheduler check failed. Membership changes can still be previewed and applied manually."
                : `Scheduler active. ${health.data.last_run ? `Last check: ${new Date(health.data.last_run).toLocaleString()}` : "Awaiting its first check."}`}
      </p>
      {changed && (
        <p role="alert">
          Saved settings changed.{" "}
          <Button
            variant="outline"
            disabled={busy}
            onClick={() => {
              setForm(criteria(rule));
              setVersion(rule?.version ?? 0);
              setPreview(null);
            }}
          >
            Reload saved settings
          </Button>
        </p>
      )}
      <fieldset disabled={busy || changed} className="grid gap-3 sm:grid-cols-2">
        <label>
          Department
          <select
            className="block w-full rounded border p-2"
            value={form.department ?? ""}
            disabled={departments.isPending || departments.isError}
            onChange={(e) => edit({ department: e.target.value || null })}
          >
            <option value="">All departments</option>
            {departments.data?.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </select>
          {departments.isError && <span role="alert">Departments could not load.</span>}
        </label>
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={form.descendants}
            onChange={(e) => edit({ descendants: e.target.checked })}
          />
          Include subdepartments
        </label>
        <label>
          Job title contains
          <input
            className="block w-full rounded border p-2"
            maxLength={200}
            value={form.job ?? ""}
            onChange={(e) => edit({ job: e.target.value || null })}
          />
        </label>
        <label>
          Workspace role
          <select
            className="block w-full rounded border p-2"
            value={form.role}
            onChange={(e) => edit({ role: e.target.value })}
          >
            <option value="learner">Learners</option>
            <option value="manager">Managers</option>
            <option value="all">Everyone</option>
          </select>
        </label>
        <label>
          Check interval (minutes)
          <input
            className="block w-full rounded border p-2"
            type="number"
            min={15}
            max={10080}
            value={form.interval}
            onChange={(e) => edit({ interval: Number(e.target.value) })}
          />
        </label>
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={form.addOnly}
            onChange={(e) => edit({ addOnly: e.target.checked })}
          />
          Only add members; keep people who stop matching
        </label>
      </fieldset>
      <p className="text-sm">
        Leaving department and job title unrestricted matches everyone in the selected workspace
        role.
      </p>
      <div className="flex flex-wrap gap-2">
        <Button
          disabled={busy || changed || !assignmentRuleCriteria.safeParse(form).success}
          onClick={save}
        >
          Save paused rule
        </Button>
        <Button variant="outline" disabled={busy || !clean} onClick={getPreview}>
          Preview saved rule
        </Button>
        {rule?.enabled && (
          <Button variant="outline" disabled={busy || changed} onClick={() => schedule(false)}>
            Pause schedule
          </Button>
        )}
      </div>
      {rule && (
        <p className="text-sm">
          Rule version {rule.version} · {rule.enabled ? "Scheduled" : "Paused"}
          {rule.last_run &&
            ` · Last run: ${new Date(rule.last_run).toLocaleString()} (${rule.last_status}; version ${rule.last_run_version ?? "unknown"}) · Added ${rule.last_added}, removed ${rule.last_removed}`}
        </p>
      )}
      {preview && clean && (
        <div className="space-y-2 rounded border p-3">
          <p>
            {preview.matching} matching · {preview.add} additions · {preview.remove} removals ·{" "}
            {preview.excluded} manual exclusions.
          </p>
          {!preview.capacity_ok && (
            <p role="alert">Group capacity is too small. Increase it or narrow the criteria.</p>
          )}
          {preview.examples.map((p, i) => (
            <p className="text-sm" key={i}>
              {p.action}: {p.name}
            </p>
          ))}
          <p className="text-xs">
            Showing up to 20 examples. Every change is checked again before applying.
          </p>
          <div className="flex flex-wrap gap-2">
            <Button disabled={busy || !preview.capacity_ok} onClick={apply}>
              Apply preview once
            </Button>
            <Button
              variant="outline"
              disabled={busy || !preview.capacity_ok || !health.data?.scheduled}
              onClick={() => schedule(true)}
            >
              Enable schedule from preview
            </Button>
          </div>
        </div>
      )}
      <details>
        <summary>Manual exclusions ({exclusions.data?.count ?? "…"})</summary>
        {exclusions.isError ? (
          <p role="alert">Could not load exclusions.</p>
        ) : (
          exclusions.data?.rows.map((p) => (
            <div className="flex items-center justify-between gap-2 py-2" key={p.user_id}>
              <span>{p.full_name}</span>
              <Button
                variant="outline"
                disabled={busy}
                onClick={() =>
                  perform(async () => {
                    if (
                      !(await confirm({
                        title: "Allow matching rules to add this person again?",
                        description:
                          "They will only be added if they match the saved criteria when it runs.",
                        confirmLabel: "Allow again",
                      }))
                    )
                      return;
                    const { error } = await supabase.rpc("allow_cohort_rule_member", {
                      _cohort: cohortId,
                      _user: p.user_id,
                    });
                    if (error) throw error;
                    setPreview(null);
                    await refresh();
                  })
                }
              >
                Allow again
              </Button>
            </div>
          ))
        )}
        <div className="flex gap-2">
          <Button
            variant="outline"
            disabled={busy || exclusionPage === 0}
            onClick={() => setExclusionPage(exclusionPage - 1)}
          >
            Previous
          </Button>
          <Button
            variant="outline"
            disabled={busy || (exclusionPage + 1) * 20 >= (exclusions.data?.count ?? 0)}
            onClick={() => setExclusionPage(exclusionPage + 1)}
          >
            Next
          </Button>
        </div>
      </details>
      <details>
        <summary>Recorded membership updates</summary>
        {history.isError ? (
          <p role="alert">Could not load history.</p>
        ) : (
          history.data?.rows.map((run) => {
            const parsed = assignmentRuleResult.safeParse(run.result);
            return (
              <div className="space-y-1 border-b py-2" key={run.request_id}>
                <p>
                  {new Date(run.created_at).toLocaleString()} · {run.actor_name}
                </p>
                <p>
                  {parsed.success
                    ? `Added ${parsed.data.added}; removed ${parsed.data.removed}.`
                    : "Update recorded."}
                </p>
                <Button
                  variant="outline"
                  disabled={busy}
                  onClick={() =>
                    perform(async () => {
                      const { data, error } = await supabase.rpc("cohort_assignment_rule_changes", {
                        _request: run.request_id,
                      });
                      if (error) throw error;
                      const url = URL.createObjectURL(
                        new Blob([assignmentRuleChangesCsv(data)], {
                          type: "text/csv;charset=utf-8",
                        }),
                      );
                      const anchor = document.createElement("a");
                      anchor.href = url;
                      anchor.download = `membership-changes-${run.request_id}.csv`;
                      anchor.click();
                      setTimeout(() => URL.revokeObjectURL(url), 1000);
                    })
                  }
                >
                  Export recorded changes
                </Button>
              </div>
            );
          })
        )}
        <div className="flex gap-2">
          <Button
            variant="outline"
            disabled={busy || historyPage === 0}
            onClick={() => setHistoryPage(historyPage - 1)}
          >
            Previous
          </Button>
          <Button
            variant="outline"
            disabled={busy || (historyPage + 1) * 10 >= (history.data?.count ?? 0)}
            onClick={() => setHistoryPage(historyPage + 1)}
          >
            Next
          </Button>
        </div>
      </details>
    </div>
  );
}
