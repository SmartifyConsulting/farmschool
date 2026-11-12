import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { friendlyError } from "@/lib/friendly-error";
import { Button } from "@/components/ui/button";

export function SubmissionPolicy({
  courseId,
  competencies,
}: {
  courseId: string;
  competencies: { id: string; title: string }[];
}) {
  const queryClient = useQueryClient();
  const [selected, setSelected] = useState("");
  const [allowed, setAllowed] = useState(true);
  const [busy, setBusy] = useState(false);
  const policy = useQuery({
    queryKey: ["submission-policy", selected],
    enabled: !!selected,
    refetchOnWindowFocus: false,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("course_competencies")
        .select("late_submissions_allowed")
        .eq("id", selected)
        .single();
      if (error) throw error;
      return data;
    },
  });
  useEffect(() => {
    setAllowed(policy.data?.late_submissions_allowed ?? true);
  }, [selected, policy.data]);
  const save = async () => {
    if (busy || !policy.data) return;
    setBusy(true);
    try {
      const { error } = await supabase.rpc("set_competency_late_policy", {
        _competency: selected,
        _allow_late: allowed,
        _expected_allowed: policy.data.late_submissions_allowed,
      });
      if (error) throw error;
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["submission-policy", selected] }),
        queryClient.invalidateQueries({ queryKey: ["course-submissions", courseId] }),
      ]);
      toast.success("Late submission policy saved.");
    } catch (error) {
      toast.error(friendlyError(error, "Could not save the policy. Refresh and try again."));
      await queryClient.invalidateQueries({ queryKey: ["submission-policy", selected] });
    } finally {
      setBusy(false);
    }
  };
  return (
    <section className="space-y-3 rounded-xl border p-4 lg:col-span-2">
      <h2 className="font-semibold">Submission deadline policy</h2>
      <p className="text-sm text-muted-foreground">
        Each learner's earliest dated cohort assignment is their course deadline. Learners without a
        dated assignment have no deadline. Changes affect new attempts only; earlier deadline
        snapshots are kept.
      </p>
      <select
        aria-label="Competency late policy"
        className="w-full rounded-md border bg-background p-2 text-sm"
        disabled={busy}
        value={selected}
        onChange={(event) => setSelected(event.target.value)}
      >
        <option value="">Choose competency</option>
        {competencies.map((item) => (
          <option key={item.id} value={item.id}>
            {item.title}
          </option>
        ))}
      </select>
      {policy.isLoading && selected && <p>Loading policy…</p>}
      {policy.error && (
        <p role="alert" className="text-destructive">
          Could not load this submission policy.
        </p>
      )}
      {policy.data && (
        <>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              disabled={busy}
              checked={allowed}
              onChange={(event) => setAllowed(event.target.checked)}
            />
            Accept late submissions and label them as late
          </label>
          <p className="text-xs text-muted-foreground">
            When disabled, the server blocks attempts after the deadline. Extend the learner's
            individual deadline or cohort due date to reopen submissions.
          </p>
          <Button
            disabled={busy || allowed === policy.data.late_submissions_allowed}
            onClick={() => void save()}
          >
            Save policy
          </Button>
        </>
      )}
    </section>
  );
}
