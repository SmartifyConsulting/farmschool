import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useConfirm } from "@/components/ConfirmDialog";
import { useAuth } from "@/hooks/useLearning";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import { friendlyError } from "@/lib/friendly-error";
import { examPolicySettings } from "@/lib/exam-controls";
import { quizSampleSize } from "@/lib/quiz-pools";

type Policy = Database["public"]["Tables"]["studio_quiz_policies"]["Row"];
type Props = { lessonId: string; body: string; readOnly: boolean };
export function QuizExamPolicy(props: Props) {
  const { user } = useAuth();
  const query = useQuery({
    queryKey: ["quiz-exam-policy", props.lessonId, user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("studio_quiz_policies")
        .select("*")
        .eq("lesson_id", props.lessonId)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });
  return (
    <section className="space-y-3 border-t p-4">
      <h4 className="font-semibold">Exam controls</h4>
      {query.isPending ? (
        <p>Loading exam settings…</p>
      ) : query.isError ? (
        <p role="alert">
          Could not load exam settings.{" "}
          <Button variant="outline" onClick={() => query.refetch()}>
            Retry
          </Button>
        </p>
      ) : (
        <PolicyEditor {...props} policy={query.data} />
      )}
    </section>
  );
}
function PolicyEditor({ lessonId, body, readOnly, policy }: Props & { policy: Policy | null }) {
  const qc = useQueryClient();
  const confirm = useConfirm();
  const [maximum, setMaximum] = useState(policy?.max_attempts?.toString() ?? "");
  const [duration, setDuration] = useState(policy?.duration_minutes ?? 240);
  const [spacing, setSpacing] = useState(policy?.retry_minutes ?? 0);
  const [version, setVersion] = useState(policy?.version ?? 0);
  const [busy, setBusy] = useState(false);
  const changed = version !== (policy?.version ?? 0);
  const valid = examPolicySettings.safeParse({
    maxAttempts: maximum.trim() ? Number(maximum) : null,
    durationMinutes: duration,
    startSpacingMinutes: spacing,
  });
  const eligible = quizSampleSize(body) !== null;
  const save = async (remove: boolean) => {
    if (busy || readOnly || changed || (!remove && (!valid.success || !eligible))) return;
    if (
      !(await confirm({
        title: remove ? "Remove custom exam controls?" : "Save exam controls?",
        description: remove
          ? "Future attempts use the standard four-hour timer and daily safety quota. Existing attempts retain their saved timer and questions."
          : "Limits apply to new starts. An unfinished attempt keeps its original timer and questions. Each certificate-renewal cycle receives a fresh attempt allowance; grades are retained.",
        confirmLabel: remove ? "Remove controls" : "Save controls",
      }))
    )
      return;
    setBusy(true);
    try {
      if (remove) {
        const { error } = await supabase.rpc("remove_quiz_exam_policy", {
          _lesson: lessonId,
          _expected: version,
        });
        if (error) throw error;
        setVersion(0);
        setMaximum("");
        setDuration(240);
        setSpacing(0);
      } else if (valid.success) {
        const { data, error } = await supabase.rpc("save_quiz_exam_policy", {
          _lesson: lessonId,
          _max: valid.data.maxAttempts,
          _duration: valid.data.durationMinutes,
          _retry: valid.data.startSpacingMinutes,
          _expected: version,
        });
        if (error) throw error;
        setVersion(data);
      }
      await qc.invalidateQueries({ queryKey: ["quiz-exam-policy", lessonId] });
      toast.success("Exam controls updated.");
    } catch (error) {
      toast.error(friendlyError(error));
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground">
        Save a question sample first; choose all questions for a fixed-length exam. Limits include
        abandoned and expired starts. A certificate-renewal cycle starts a fresh allowance. The
        daily safety quota of 50 new exam starts still applies across quizzes. Existing
        highest-score and passed-quiz records are retained.
      </p>
      {readOnly && (
        <p className="text-xs">Create a revision or unpublish to change exam controls.</p>
      )}
      {!eligible && (
        <p className="text-xs">Enable and save a question sample above before adding controls.</p>
      )}
      {changed && (
        <p role="alert">
          Saved controls changed.{" "}
          <Button
            variant="outline"
            disabled={busy}
            onClick={() => {
              setMaximum(policy?.max_attempts?.toString() ?? "");
              setDuration(policy?.duration_minutes ?? 240);
              setSpacing(policy?.retry_minutes ?? 0);
              setVersion(policy?.version ?? 0);
            }}
          >
            Reload controls
          </Button>
        </p>
      )}
      <fieldset disabled={readOnly || busy || changed} className="grid gap-3 sm:grid-cols-3">
        <label>
          Maximum starts per cycle
          <Input
            type="number"
            min={1}
            max={1000}
            placeholder="No custom limit"
            value={maximum}
            onChange={(event) => setMaximum(event.target.value)}
          />
        </label>
        <label>
          Time limit (minutes)
          <Input
            type="number"
            min={1}
            max={1440}
            value={duration}
            onChange={(event) => setDuration(Number(event.target.value))}
          />
        </label>
        <label>
          Minimum minutes between starts
          <Input
            type="number"
            min={0}
            max={10080}
            value={spacing}
            onChange={(event) => setSpacing(Number(event.target.value))}
          />
        </label>
      </fieldset>
      {!readOnly && (
        <div className="flex flex-wrap gap-2">
          <Button
            disabled={busy || changed || !eligible || !valid.success}
            onClick={() => save(false)}
          >
            Save exam controls
          </Button>
          {policy && (
            <Button variant="outline" disabled={busy || changed} onClick={() => save(true)}>
              Remove custom controls
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
