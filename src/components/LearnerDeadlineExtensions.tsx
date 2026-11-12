import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useConfirm } from "@/components/ConfirmDialog";
import { friendlyError } from "@/lib/friendly-error";

export function LearnerDeadlineExtensions({
  courseId,
  learners,
}: {
  courseId: string;
  learners: { user_id: string; full_name: string }[];
}) {
  const qc = useQueryClient();
  const confirm = useConfirm();
  const [learner, setLearner] = useState("");
  const [due, setDue] = useState("");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const extension = useQuery({
    queryKey: ["deadline-extension", courseId, learner],
    enabled: !!learner,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("course_deadline_extensions")
        .select("due_at,reason,version,changed_at")
        .eq("course_id", courseId)
        .eq("user_id", learner)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });
  const save = async (clear: boolean) => {
    if (busy || !learner || extension.isPending || extension.isError) return;
    if (reason.trim().length < 20 || (!clear && (!due || !Number.isFinite(Date.parse(due))))) {
      toast.error("Choose a new deadline and give a reason of at least 20 characters.");
      return;
    }
    if (
      clear &&
      !(await confirm({
        title: "Remove this deadline extension?",
        description:
          "The learner will return to their cohort deadline, which may already have passed.",
        confirmLabel: "Remove extension",
      }))
    )
      return;
    setBusy(true);
    try {
      const { error } = await supabase.rpc("set_learner_deadline", {
        _course: courseId,
        _learner: learner,
        _due_at: clear ? null : new Date(due).toISOString(),
        _reason: reason.trim(),
        _expected_version: extension.data?.version ?? 0,
      });
      if (error) throw error;
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["deadline-extension", courseId] }),
        qc.invalidateQueries({ queryKey: ["course-submissions", courseId] }),
        qc.invalidateQueries({ queryKey: ["my-course-assignments"] }),
        qc.invalidateQueries({ queryKey: ["assignment-notifications"] }),
        qc.invalidateQueries({ queryKey: ["cohort-progress"] }),
      ]);
      setDue("");
      setReason("");
      toast.success(
        clear
          ? "Extension removed; the cohort deadline applies."
          : "Individual deadline extension saved.",
      );
    } catch (error) {
      toast.error(friendlyError(error));
    } finally {
      setBusy(false);
    }
  };
  return (
    <section className="space-y-3 rounded-xl border p-4 lg:col-span-2">
      <h2 className="font-semibold">Individual deadline extensions</h2>
      <p className="text-sm text-muted-foreground">
        Extend one learner’s course submission deadline without changing their cohort. The new
        deadline must be later than their earliest cohort deadline. Existing submissions retain the
        deadline used when submitted.
      </p>
      <select
        aria-label="Learner for deadline extension"
        className="w-full rounded-md border bg-background p-2"
        value={learner}
        onChange={(e) => {
          setLearner(e.target.value);
          setDue("");
          setReason("");
        }}
      >
        <option value="">Choose learner</option>
        {learners.map((item) => (
          <option key={item.user_id} value={item.user_id}>
            {item.full_name}
          </option>
        ))}
      </select>
      {extension.data?.due_at && (
        <p className="text-sm">
          Current extension: {new Date(extension.data.due_at).toLocaleString()} ·{" "}
          {extension.data.reason}
        </p>
      )}
      {extension.isError && (
        <p role="alert">Could not load the extension. Refresh before saving.</p>
      )}
      <Input
        type="datetime-local"
        aria-label="New individual deadline"
        value={due}
        onChange={(e) => setDue(e.target.value)}
        disabled={busy}
      />
      <Textarea
        aria-label="Deadline extension reason"
        value={reason}
        maxLength={2000}
        onChange={(e) => setReason(e.target.value)}
        disabled={busy}
        placeholder="Explain the extension or removal (20–2000 characters)."
      />
      <div className="flex gap-2">
        <Button
          disabled={busy || !learner || extension.isPending || extension.isError}
          onClick={() => save(false)}
        >
          Save extension
        </Button>
        <Button
          variant="outline"
          disabled={busy || !extension.data?.due_at}
          onClick={() => save(true)}
        >
          Remove extension
        </Button>
      </div>
    </section>
  );
}
