import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/hooks/useLearning";
import { supabase } from "@/integrations/supabase/client";
import { friendlyError } from "@/lib/friendly-error";

type Rule = {
  id: string;
  organization_id: string;
  title: string;
  body: string;
  department_id: string | null;
  include_descendants: boolean;
  job_contains: string | null;
  role_filter: "learner" | "manager" | "all";
  enabled: boolean;
  interval_minutes: number;
  version: number;
  next_run: string;
  last_run: string | null;
  last_status: string | null;
  last_sent: number;
};
type Department = { id: string; name: string };

function emptyDraft(organizationId: string) {
  return {
    organizationId,
    title: "",
    body: "",
    department: "" as string,
    descendants: true,
    job: "",
    role: "learner" as "learner" | "manager" | "all",
    interval: 60,
  };
}

export function OrganizationNotificationRules({ organizationId }: { organizationId: string }) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [creating, setCreating] = useState(false);
  const [draft, setDraft] = useState(() => emptyDraft(organizationId));
  const [busy, setBusy] = useState(false);

  const rules = useQuery({
    queryKey: ["org-notification-rules", organizationId, user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("organization_notification_rules")
        .select("*")
        .eq("organization_id", organizationId)
        .order("title");
      if (error) throw error;
      return (data ?? []) as Rule[];
    },
  });

  const departments = useQuery({
    queryKey: ["org-notification-rule-departments", organizationId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("organization_departments")
        .select("id,name")
        .eq("organization_id", organizationId)
        .order("name");
      if (error) throw error;
      return (data ?? []) as Department[];
    },
  });

  const create = async () => {
    if (draft.title.trim().length < 1 || busy) return;
    setBusy(true);
    try {
      const { error } = await supabase.rpc("save_organization_notification_rule", {
        _id: null,
        _organization: organizationId,
        _title: draft.title.trim(),
        _body: draft.body.trim(),
        _department: draft.department || null,
        _descendants: draft.descendants,
        _job: draft.job.trim() || null,
        _role: draft.role,
        _interval: draft.interval,
        _expected: 0,
      });
      if (error) throw error;
      toast.success("Notification rule created, paused.");
      setCreating(false);
      setDraft(emptyDraft(organizationId));
      qc.invalidateQueries({ queryKey: ["org-notification-rules", organizationId, user?.id] });
    } catch (error) {
      toast.error(friendlyError(error, "Could not create this rule."));
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="space-y-3 rounded-xl border p-4">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold">Notification rules</h3>
        <Button size="sm" variant="outline" onClick={() => setCreating((v) => !v)}>
          {creating ? "Cancel" : "New rule"}
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">
        Automatically send an in-app notification to everyone matching a department/job-title/role
        filter. Each matched person is notified once per rule — save the rule paused, preview who it
        matches, then turn it on.
      </p>
      {creating && (
        <div className="space-y-2 rounded-lg border border-border p-3">
          <Input placeholder="Notification title" value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} disabled={busy} />
          <Textarea placeholder="Message body" value={draft.body} onChange={(e) => setDraft({ ...draft, body: e.target.value })} disabled={busy} />
          <div className="grid gap-2 sm:grid-cols-2">
            <select
              className="rounded-md border bg-background p-2 text-sm"
              value={draft.department}
              disabled={busy || departments.isPending}
              onChange={(e) => setDraft({ ...draft, department: e.target.value })}
            >
              <option value="">All departments</option>
              {departments.data?.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </select>
            <select
              className="rounded-md border bg-background p-2 text-sm"
              value={draft.role}
              disabled={busy}
              onChange={(e) => setDraft({ ...draft, role: e.target.value as typeof draft.role })}
            >
              <option value="learner">Learners</option>
              <option value="manager">Managers</option>
              <option value="all">Everyone</option>
            </select>
          </div>
          <Input placeholder="Job title contains (optional)" value={draft.job} onChange={(e) => setDraft({ ...draft, job: e.target.value })} disabled={busy} />
          <Button size="sm" disabled={busy || draft.title.trim().length < 1} onClick={create}>
            {busy ? "Creating…" : "Create rule"}
          </Button>
        </div>
      )}
      {rules.isLoading && <p className="text-sm text-muted-foreground">Loading rules…</p>}
      {rules.isError && <p role="alert" className="text-sm text-destructive">{friendlyError(rules.error, "Could not load rules.")}</p>}
      {!rules.isLoading && !rules.isError && !rules.data?.length && (
        <p className="text-sm text-muted-foreground">No notification rules yet.</p>
      )}
      <div className="space-y-2">
        {rules.data?.map((rule) => (
          <RuleRow
            key={rule.id}
            rule={rule}
            onChanged={() => qc.invalidateQueries({ queryKey: ["org-notification-rules", organizationId, user?.id] })}
          />
        ))}
      </div>
    </section>
  );
}

function RuleRow({ rule, onChanged }: { rule: Rule; onChanged: () => void }) {
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState<{ hash: string; notify: number; examples: string[] } | null>(null);

  const doPreview = async () => {
    setBusy(true);
    try {
      const { data, error } = await supabase.rpc("preview_organization_notification_rule", {
        _rule: rule.id,
        _expected: rule.version,
      });
      if (error) throw error;
      setPreview(data as unknown as { hash: string; notify: number; examples: string[] });
    } catch (error) {
      toast.error(friendlyError(error, "Could not preview this rule."));
    } finally {
      setBusy(false);
    }
  };

  const send = async () => {
    if (!preview) return;
    setBusy(true);
    try {
      const { data, error } = await supabase.rpc("run_organization_notification_rule", {
        _rule: rule.id,
        _hash: preview.hash,
        _request: crypto.randomUUID(),
      });
      if (error) throw error;
      const result = data as unknown as { sent: number };
      toast.success(`Sent to ${result.sent} people.`);
      setPreview(null);
      onChanged();
    } catch (error) {
      toast.error(friendlyError(error, "Could not send this notification."));
    } finally {
      setBusy(false);
    }
  };

  const toggleSchedule = async () => {
    setBusy(true);
    try {
      if (!rule.enabled && !preview) {
        toast.error("Preview the matching list before enabling scheduling.");
        return;
      }
      const { error } = await supabase.rpc("set_organization_notification_rule_schedule", {
        _rule: rule.id,
        _expected: rule.version,
        _enabled: !rule.enabled,
      });
      if (error) throw error;
      toast.success(rule.enabled ? "Schedule paused." : "Schedule enabled.");
      onChanged();
    } catch (error) {
      toast.error(friendlyError(error, "Could not change the schedule."));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="rounded-lg border border-border p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="font-semibold">
          {rule.title}
          {rule.enabled && (
            <span className="ml-2 rounded-full bg-primary/15 px-2 py-0.5 text-[11px] text-primary">Scheduled</span>
          )}
        </p>
        <span className="text-xs text-muted-foreground">
          Every {rule.interval_minutes}m · Last sent {rule.last_sent} ·{" "}
          {rule.last_run ? new Date(rule.last_run).toLocaleString() : "never run"}
        </span>
      </div>
      <p className="mt-1 text-sm text-muted-foreground">{rule.body}</p>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <Button size="sm" variant="outline" disabled={busy} onClick={doPreview}>
          Preview
        </Button>
        {preview && (
          <>
            <span className="text-xs text-muted-foreground">
              Matches {preview.notify} new {preview.notify === 1 ? "person" : "people"}
              {preview.examples.length ? `: ${preview.examples.slice(0, 5).join(", ")}${preview.examples.length > 5 ? "…" : ""}` : ""}
            </span>
            <Button size="sm" disabled={busy || !preview.notify} onClick={send}>
              Send now
            </Button>
          </>
        )}
        <Button size="sm" variant="outline" disabled={busy} onClick={toggleSchedule}>
          {rule.enabled ? "Pause schedule" : "Enable schedule"}
        </Button>
      </div>
    </div>
  );
}
