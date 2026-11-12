import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { friendlyError } from "@/lib/friendly-error";

export function CohortPolicies({
  cohortId,
  people,
}: {
  cohortId: string;
  people: { user_id: string; full_name: string }[];
}) {
  const qc = useQueryClient();
  const [seats, setSeats] = useState("");
  const [autoFree, setAutoFree] = useState(false);
  const [reminders, setReminders] = useState(false);
  const [manager, setManager] = useState("");
  const [busy, setBusy] = useState(false);
  const policy = useQuery({
    queryKey: ["cohort-policy", cohortId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("cohorts")
        .select("seat_limit,auto_enrol_free,reminders_enabled,policy_version")
        .eq("id", cohortId)
        .single();
      if (error) throw error;
      return data;
    },
  });
  const managers = useQuery({
    queryKey: ["cohort-report-managers", cohortId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("cohort_report_managers")
        .select("user_id")
        .eq("cohort_id", cohortId)
        .order("user_id");
      if (error) throw error;
      return data;
    },
  });
  useEffect(() => {
    if (policy.data) {
      setSeats(policy.data.seat_limit === null ? "" : String(policy.data.seat_limit));
      setAutoFree(policy.data.auto_enrol_free);
      setReminders(policy.data.reminders_enabled);
    }
  }, [cohortId, policy.data?.policy_version]);
  const save = async () => {
    if (busy || !policy.data) return;
    if (
      seats &&
      (!Number.isInteger(Number(seats)) || Number(seats) < 1 || Number(seats) > 100000)
    ) {
      toast.error("Enter a seat limit from 1 to 100,000, or leave it empty.");
      return;
    }
    setBusy(true);
    try {
      const { error } = await supabase.rpc("save_cohort_policy", {
        _cohort: cohortId,
        _seats: seats ? Number(seats) : null,
        _auto_free: autoFree,
        _reminders: reminders,
        _expected_version: policy.data.policy_version,
      });
      if (error) throw error;
      await qc.invalidateQueries({ queryKey: ["cohort-policy", cohortId] });
      toast.success("Cohort policies saved.");
    } catch (error) {
      toast.error(friendlyError(error));
    } finally {
      setBusy(false);
    }
  };
  const grant = async (userId: string, allow: boolean) => {
    if (busy || !userId) return;
    setBusy(true);
    try {
      const { error } = await supabase.rpc("set_cohort_report_manager", {
        _cohort: cohortId,
        _user: userId,
        _allow: allow,
      });
      if (error) throw error;
      await qc.invalidateQueries({ queryKey: ["cohort-report-managers", cohortId] });
      setManager("");
      toast.success(allow ? "Reporting manager appointed." : "Reporting access removed.");
    } catch (error) {
      toast.error(friendlyError(error));
    } finally {
      setBusy(false);
    }
  };
  return (
    <section className="space-y-3 rounded-xl border p-4">
      <h2 className="font-semibold">Enrolment, seats & reporting</h2>
      <Link to="/cohorts" className="text-sm font-semibold text-primary">
        Open cohort reports
      </Link>
      {policy.isError ? (
        <p role="alert">Could not load cohort policies.</p>
      ) : (
        policy.data && (
          <fieldset disabled={busy} className="space-y-3">
            <Input
              aria-label="Cohort seat limit"
              type="number"
              min="1"
              max="100000"
              value={seats}
              onChange={(e) => setSeats(e.target.value)}
              placeholder="Seat limit (empty means unlimited)"
            />
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={autoFree}
                onChange={(e) => setAutoFree(e.target.checked)}
              />
              Automatically enrol members in free assigned courses
            </label>
            <p className="text-xs text-muted-foreground">
              Applies to existing and newly added members and assignments. Paid courses still
              require a purchase. Existing purchases and learner records are kept when membership
              changes.
            </p>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={reminders}
                onChange={(e) => setReminders(e.target.checked)}
              />
              Enable scheduled assignment reminders
            </label>
            <p className="text-xs text-muted-foreground">
              Email delivery also requires the organisation’s Resend sender and scheduled delivery
              connection to be activated.
            </p>
            <Button onClick={save}>Save cohort policies</Button>
          </fieldset>
        )
      )}
      <h3 className="text-sm font-medium">Reporting managers</h3>
      <p className="text-xs text-muted-foreground">
        Appointed managers can read and export this cohort’s progress. They cannot edit membership,
        grades or purchases. Use the learner search above to find a person.
      </p>
      <div className="flex flex-wrap gap-2">
        <select
          aria-label="Appoint reporting manager"
          className="min-w-0 flex-1 rounded-md border bg-background p-2 text-sm"
          value={manager}
          onChange={(e) => setManager(e.target.value)}
        >
          <option value="">Choose a reporting manager</option>
          {people.map((person) => (
            <option key={person.user_id} value={person.user_id}>
              {person.full_name || "Learner"}
            </option>
          ))}
        </select>
        <Button disabled={busy || !manager} onClick={() => grant(manager, true)}>
          Appoint manager
        </Button>
      </div>
      {managers.isError && <p role="alert">Could not load reporting managers.</p>}
      {managers.data?.map((item) => (
        <div key={item.user_id} className="flex items-center justify-between gap-3 text-sm">
          <span>
            {people.find((person) => person.user_id === item.user_id)?.full_name ||
              "Reporting manager"}
          </span>
          <Button
            variant="outline"
            size="sm"
            disabled={busy}
            onClick={() => grant(item.user_id, false)}
          >
            Remove reporting access
          </Button>
        </div>
      ))}
    </section>
  );
}
