import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useLearning";
import { readAllPages } from "@/lib/database-pages";
import { gradeCompetencyRubric, rubricCriteria } from "@/lib/competency-rubric";
import { friendlyError } from "@/lib/friendly-error";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { RubricBreakdown } from "@/components/RubricBreakdown";

export function SubmissionReview({
  courseId,
  competencies,
  learners,
}: {
  courseId: string;
  competencies: { id: string }[];
  learners: { user_id: string; full_name: string }[];
}) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [selected, setSelected] = useState("");
  const [marks, setMarks] = useState<Record<string, string>>({});
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const submissions = useQuery({
    queryKey: [
      "submission-review",
      courseId,
      user?.id,
      competencies.map((item) => item.id).join(","),
    ],
    enabled: !!user && competencies.length > 0,
    refetchInterval: 30000,
    queryFn: async () => {
      const { data } = await readAllPages(
        supabase
          .from("competency_submissions")
          .select(
            "id,user_id,attempt,body,evidence_url,competency_title,instructions,criteria_snapshot,pass_mark,rubric_version,submitted_at,assessment_id,learner_competency_evidence(score,achieved,notes,competency_rubric_assessments(criteria_snapshot,marks,total_points,max_points,pass_mark,rubric_version))",
            { count: "exact" },
          )
          .in(
            "competency_id",
            competencies.map((item) => item.id),
          )
          .order("submitted_at", { ascending: false })
          .order("id"),
      );
      return data;
    },
  });
  useEffect(() => {
    setMarks({});
    setNotes("");
  }, [selected]);
  const submission = submissions.data?.find((item) => item.id === selected);
  const criteria = rubricCriteria.safeParse(submission?.criteria_snapshot);
  const numericMarks = Object.fromEntries(
    Object.entries(marks)
      .filter(([, value]) => value !== "")
      .map(([key, value]) => [key, Number(value)]),
  );
  let preview: ReturnType<typeof gradeCompetencyRubric> | null = null;
  try {
    if (submission)
      preview = gradeCompetencyRubric(
        submission.criteria_snapshot,
        numericMarks,
        submission.pass_mark,
      );
  } catch {
    preview = null;
  }
  const assess = async () => {
    if (!submission || !preview || busy) return;
    setBusy(true);
    try {
      const { error } = await supabase.rpc("assess_competency_submission", {
        _submission: submission.id,
        _marks: numericMarks,
        _notes: notes.trim(),
      });
      if (error) throw error;
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["submission-review", courseId] }),
        queryClient.invalidateQueries({ queryKey: ["competency-workspace", courseId] }),
        queryClient.invalidateQueries({ queryKey: ["course-submissions", courseId] }),
        queryClient.invalidateQueries({ queryKey: ["my-competency-evidence"] }),
      ]);
      toast.success("Submission assessed. The learner can view the result and feedback.");
    } catch (error) {
      toast.error(friendlyError(error, "Could not assess this submission."));
    } finally {
      setBusy(false);
    }
  };
  return (
    <section className="space-y-4 lg:col-span-2">
      <h2 className="font-semibold">
        Learner submissions ({submissions.data?.filter((item) => !item.assessment_id).length ?? 0}{" "}
        awaiting review)
      </h2>
      {submissions.error && (
        <p role="alert" className="text-destructive">
          Could not load learner submissions.
        </p>
      )}
      <select
        aria-label="Submission to review"
        className="w-full rounded-md border bg-background p-2 text-sm"
        value={selected}
        disabled={busy}
        onChange={(event) => setSelected(event.target.value)}
      >
        <option value="">Choose a submission</option>
        {submissions.data?.map((item) => (
          <option key={item.id} value={item.id}>
            {item.assessment_id ? "Assessed" : "Pending"} · {item.competency_title} ·{" "}
            {learners.find((learner) => learner.user_id === item.user_id)?.full_name ||
              item.user_id.slice(0, 8)}{" "}
            · attempt {item.attempt}
          </option>
        ))}
      </select>
      {submission && (
        <div className="space-y-4 rounded-xl border p-4">
          <p className="font-semibold">
            {submission.competency_title} · rubric v{submission.rubric_version}
          </p>
          <p className="whitespace-pre-wrap text-sm text-muted-foreground">
            Task: {submission.instructions}
          </p>
          <p className="whitespace-pre-wrap text-sm">{submission.body}</p>
          {submission.evidence_url && (
            <a
              href={submission.evidence_url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm font-medium text-primary underline"
            >
              Open supporting evidence
            </a>
          )}
          {submission.learner_competency_evidence ? (
            <div className="space-y-2 text-sm">
              <p className="font-semibold">
                {submission.learner_competency_evidence.score}% ·{" "}
                {submission.learner_competency_evidence.achieved
                  ? "Demonstrated"
                  : "Not yet demonstrated"}
              </p>
              <p className="whitespace-pre-wrap">{submission.learner_competency_evidence.notes}</p>
              <RubricBreakdown
                snapshot={submission.learner_competency_evidence.competency_rubric_assessments}
              />
            </div>
          ) : (
            <form
              className="space-y-3"
              onSubmit={(event) => {
                event.preventDefault();
                void assess();
              }}
            >
              <p className="text-xs text-muted-foreground">
                Grade against the rubric saved with this submission. Pass mark:{" "}
                {submission.pass_mark}%.
              </p>
              {criteria.success &&
                criteria.data.map((criterion) => (
                  <label key={criterion.id} className="block text-sm">
                    {criterion.title} (out of {criterion.maxPoints})
                    <p className="text-xs text-muted-foreground">{criterion.description}</p>
                    <Input
                      type="number"
                      required
                      min={0}
                      max={criterion.maxPoints}
                      step="0.01"
                      disabled={busy}
                      value={marks[criterion.id] ?? ""}
                      onChange={(event) =>
                        setMarks({ ...marks, [criterion.id]: event.target.value })
                      }
                    />
                  </label>
                ))}
              {preview && (
                <p className="text-sm font-semibold">
                  Preview: {preview.score}% ·{" "}
                  {preview.achieved ? "Demonstrated" : "Not yet demonstrated"}
                </p>
              )}
              <Textarea
                aria-label="Submission feedback"
                placeholder="Explain the evidence and your assessment decision."
                required
                minLength={10}
                maxLength={2000}
                value={notes}
                disabled={busy}
                onChange={(event) => setNotes(event.target.value)}
              />
              <Button disabled={busy || !preview}>Record assessment</Button>
            </form>
          )}
        </div>
      )}
    </section>
  );
}
