import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/hooks/useLearning";
import { useConfirm } from "@/components/ConfirmDialog";
import { supabase } from "@/integrations/supabase/client";
import { friendlyError } from "@/lib/friendly-error";

const schema = z.object({
  can_appoint: z.boolean(),
  grants: z.array(
    z.object({
      user_id: z.string().uuid(),
      full_name: z.string(),
      version: z.number().int().positive(),
      reason: z.string(),
    }),
  ),
  candidates: z.array(z.object({ user_id: z.string().uuid(), full_name: z.string() })),
});
export function CohortBillingManagers({
  cohortId,
  organizationId,
}: {
  cohortId: string;
  organizationId: string;
}) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const confirm = useConfirm();
  const [selected, setSelected] = useState("");
  const [version, setVersion] = useState(0);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const management = useQuery({
    queryKey: ["cohort-billing-management", cohortId, user?.id],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("cohort_billing_management", {
        _cohort: cohortId,
      });
      if (error) throw error;
      return schema.parse(data);
    },
  });
  const change = async (allow: boolean) => {
    if (busy || !selected || reason.trim().length < 20) return;
    if (
      !(await confirm({
        title: allow ? "Appoint a cohort billing manager?" : "Revoke delegated billing access?",
        description: allow
          ? "This manager can start purchases, allocate already-funded named licences, export licence reports and suspend or restore group access. Original buyers and permanent learner allocations are retained."
          : "Further billing actions will be denied. Funded learner access and historical records remain unchanged.",
        confirmLabel: allow ? "Appoint billing manager" : "Revoke delegation",
      }))
    )
      return;
    setBusy(true);
    try {
      const { error } = await supabase.rpc("set_cohort_billing_manager", {
        _cohort: cohortId,
        _user: selected,
        _allow: allow,
        _expected: version,
        _reason: reason.trim(),
      });
      if (error) throw error;
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["cohort-billing-management", cohortId] }),
        qc.invalidateQueries({ queryKey: ["organization-training", organizationId] }),
      ]);
      setSelected("");
      setVersion(0);
      setReason("");
      toast.success("Billing authority updated.");
    } catch (error) {
      toast.error(friendlyError(error));
    } finally {
      setBusy(false);
    }
  };
  const people = new Map(
    [...(management.data?.grants ?? []), ...(management.data?.candidates ?? [])].map((p) => [
      p.user_id,
      p.full_name,
    ]),
  );
  return (
    <section className="space-y-3 rounded border p-3">
      <h3 className="font-semibold">Billing management</h3>
      {management.isPending ? (
        <p>Loading billing authority…</p>
      ) : management.isError ? (
        <p role="alert">Could not load billing authority.</p>
      ) : !management.data.can_appoint ? (
        <p className="text-sm">
          The organization owner can appoint billing managers. Active cohort creators retain their
          billing authority.
        </p>
      ) : (
        <>
          <p className="text-sm">
            The organization owner and active cohort creator have billing access. Appoint another
            current workspace manager to support handover.
          </p>
          {management.data.grants.map((g) => (
            <p className="text-sm" key={g.user_id}>
              {g.full_name} · {g.reason}
            </p>
          ))}
          <select
            className="w-full rounded border p-2"
            aria-label="Delegated cohort billing manager"
            value={selected}
            disabled={busy}
            onChange={(e) => {
              setSelected(e.target.value);
              setVersion(
                management.data.grants.find((g) => g.user_id === e.target.value)?.version ?? 0,
              );
              setReason("");
            }}
          >
            <option value="">Choose a manager</option>
            {[...people].map(([id, name]) => (
              <option key={id} value={id}>
                {name}
              </option>
            ))}
          </select>
          <Textarea
            aria-label="Billing delegation reason"
            value={reason}
            maxLength={2000}
            placeholder="Reason for granting or revoking authority (20–2000 characters)"
            disabled={busy}
            onChange={(e) => setReason(e.target.value)}
          />
          <div className="flex gap-3">
            <Button
              disabled={busy || !selected || reason.trim().length < 20}
              onClick={() => change(true)}
            >
              Grant / update authority
            </Button>
            <Button
              variant="outline"
              disabled={busy || !selected || !version || reason.trim().length < 20}
              onClick={() => change(false)}
            >
              Revoke delegation
            </Button>
          </div>
        </>
      )}
    </section>
  );
}
