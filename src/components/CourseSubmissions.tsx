import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useLearning";
import { readAllPages } from "@/lib/database-pages";
import { competencySubmission } from "@/lib/competency-submissions";
import { rubricCriteria } from "@/lib/competency-rubric";
import { friendlyError } from "@/lib/friendly-error";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { RubricBreakdown } from "@/components/RubricBreakdown";

export function CourseSubmissions({ courseId }: { courseId: string }) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [selected, setSelected] = useState("");
  const [body, setBody] = useState("");
  const [evidenceUrl, setEvidenceUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const workspace = useQuery({
    queryKey: ["course-submissions", courseId, user?.id],
    enabled: !!user,
    refetchInterval: 30000,
    queryFn: async () => {
      const tasks = await readAllPages(
        supabase
          .from("course_competencies")
          .select("id,code,title,description,rubric,rubric_pass_mark,rubric_version", {
            count: "exact",
          })
          .eq("course_id", courseId)
          .gt("rubric_version", 0)
          .order("code")
          .order("id"),
      );
      const submissions = tasks.data.length
        ? await readAllPages(
            supabase
              .from("competency_submissions")
              .select(
                "id,competency_id,attempt,body,evidence_url,competency_title,instructions,criteria_snapshot,pass_mark,rubric_version,submitted_at,assessment_id,learner_competency_evidence(score,achieved,notes,competency_rubric_assessments(criteria_snapshot,marks,total_points,max_points,pass_mark,rubric_version))",
                { count: "exact" },
              )
              .eq("user_id", user!.id)
              .in(
                "competency_id",
                tasks.data.map((task) => task.id),
              )
              .order("attempt", { ascending: false })
              .order("id"),
          )
        : { data: [] };
      return { tasks: tasks.data, submissions: submissions.data };
    },
  });
  const task = workspace.data?.tasks.find((item) => item.id === selected);
  const history =
    workspace.data?.submissions.filter((item) => item.competency_id === selected) ?? [];
  const pending = history.some((item) => !item.assessment_id);
  const submit = async () => {
    if (!task || !user || busy) return;
    const parsed = competencySubmission.safeParse({ body, evidenceUrl });
    if (!parsed.success) {
      toast.error(
        "Provide 20–20,000 characters of written evidence and an optional secure HTTPS link.",
      );
      return;
    }
    setBusy(true);
    try {
      const { error } = await supabase.rpc("submit_competency_work", {
        _competency: task.id,
        _body: parsed.data.body,
        _evidence_url: parsed.data.evidenceUrl,
        _expected_version: task.rubric_version,
      });
      if (error) throw error;
      setBody("");
      setEvidenceUrl("");
      await queryClient.invalidateQueries({ queryKey: ["course-submissions", courseId, user.id] });
      toast.success("Work submitted for trainer review.");
    } catch (error) {
      toast.error(
        friendlyError(error, "Could not submit your work. Refresh if the rubric changed."),
      );
    } finally {
      setBusy(false);
    }
  };
  if (!user) return null;
  if (workspace.error)
    return (
      <p role="alert" className="text-sm text-destructive">
        Could not load course submissions.
      </p>
    );
  if (!workspace.data?.tasks.length) return null;
  const criteria = rubricCriteria.safeParse(task?.rubric);
  return (
    <section className="space-y-4 rounded-xl border p-4">
      <h2 className="text-lg font-semibold">Submit competency evidence</h2>
      <select
        aria-label="Submission competency"
        disabled={busy}
        className="w-full rounded-md border bg-background p-2 text-sm"
        value={selected}
        onChange={(event) => {
          setSelected(event.target.value);
          setBody("");
          setEvidenceUrl("");
        }}
      >
        <option value="">Choose a competency</option>
        {workspace.data.tasks.map((item) => (
          <option key={item.id} value={item.id}>
            {item.code} · {item.title}
          </option>
        ))}
      </select>
      {task && (
        <>
          <p className="whitespace-pre-wrap text-sm">
            {task.description ||
              "Explain and provide evidence of how you demonstrated this competency."}
          </p>
          <details className="text-sm">
            <summary className="cursor-pointer">
              Current grading criteria · pass mark {task.rubric_pass_mark}%
            </summary>
            <ul className="mt-2 space-y-2">
              {criteria.success &&
                criteria.data.map((criterion) => (
                  <li key={criterion.id}>
                    {criterion.title} · {criterion.maxPoints} points
                    <p className="text-xs text-muted-foreground">{criterion.description}</p>
                  </li>
                ))}
            </ul>
          </details>
          {pending ? (
            <p className="text-sm font-medium text-primary">
              Your latest submission is awaiting trainer review. You can submit another attempt
              after it is assessed.
            </p>
          ) : (
            <form
              className="space-y-3"
              onSubmit={(event) => {
                event.preventDefault();
                void submit();
              }}
            >
              <Textarea
                aria-label="Written competency evidence"
                required
                minLength={20}
                maxLength={20000}
                rows={6}
                placeholder="Describe your work, observations and results."
                disabled={busy}
                value={body}
                onChange={(event) => setBody(event.target.value)}
              />
              <Input
                type="url"
                aria-label="Optional evidence link"
                placeholder="Optional HTTPS link to supporting evidence"
                maxLength={2000}
                disabled={busy}
                value={evidenceUrl}
                onChange={(event) => setEvidenceUrl(event.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                Written evidence and links are visible to you and the course author. Submission does
                not automatically mark the competency complete.
              </p>
              <Button disabled={busy}>
                {history.length ? "Submit another attempt" : "Submit for review"}
              </Button>
            </form>
          )}
          {history.map((item) => (
            <article key={item.id} className="space-y-2 rounded-lg bg-muted p-3 text-sm">
              <p className="font-semibold">
                Attempt {item.attempt} · {item.assessment_id ? "Assessed" : "Awaiting review"} ·
                rubric v{item.rubric_version}
              </p>
              <p className="whitespace-pre-wrap">{item.body}</p>
              {item.evidence_url && (
                <a
                  href={item.evidence_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-medium text-primary underline"
                >
                  Supporting evidence
                </a>
              )}
              {item.learner_competency_evidence && (
                <div className="space-y-2">
                  <p className="font-semibold">
                    {item.learner_competency_evidence.score}% ·{" "}
                    {item.learner_competency_evidence.achieved
                      ? "Demonstrated"
                      : "Not yet demonstrated"}
                  </p>
                  <p className="whitespace-pre-wrap">{item.learner_competency_evidence.notes}</p>
                  <RubricBreakdown
                    snapshot={item.learner_competency_evidence.competency_rubric_assessments}
                  />
                </div>
              )}
            </article>
          ))}
        </>
      )}
    </section>
  );
}
