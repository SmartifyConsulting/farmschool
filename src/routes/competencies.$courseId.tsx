import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { Phone, Header, Sheet, CanvasHeading } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/hooks/useLearning";
import { supabase } from "@/integrations/supabase/client";
import { readAllPages } from "@/lib/database-pages";
import { friendlyError } from "@/lib/friendly-error";
import { pageMeta } from "@/lib/page-meta";
import { CompetencyRubric } from "@/components/CompetencyRubric";
import { RubricBreakdown } from "@/components/RubricBreakdown";

export const Route = createFileRoute("/competencies/$courseId")({
  component: Competencies,
  head: () =>
    pageMeta(
      "Competency assessment — Plusticity",
      "Define competencies and record trainer assessments.",
    ),
});

function Competencies() {
  const { courseId } = Route.useParams();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [code, setCode] = useState("");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [competency, setCompetency] = useState("");
  const [learner, setLearner] = useState("");
  const [score, setScore] = useState("0");
  const [achieved, setAchieved] = useState(false);
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const course = useQuery({
    queryKey: ["assessment-course", courseId, user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("studio_courses")
        .select("title,author_id")
        .eq("id", courseId)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });
  const owner = !!user && course.data?.author_id === user.id;
  const workspace = useQuery({
    queryKey: ["competency-workspace", courseId, user?.id],
    enabled: owner,
    queryFn: async () => {
      const competencies = await readAllPages(
        supabase
          .from("course_competencies")
          .select("id,code,title,description", { count: "exact" })
          .eq("course_id", courseId)
          .order("code")
          .order("id"),
      );
      const learners = await supabase.rpc("course_assessment_learners", { _course: courseId });
      if (learners.error) throw learners.error;
      const evidence = competencies.data.length
        ? await readAllPages(
            supabase
              .from("learner_competency_evidence")
              .select(
                "id,user_id,competency_id,achieved,score,notes,assessed_at,competency_rubric_assessments(criteria_snapshot,marks,total_points,max_points,pass_mark,rubric_version)",
                {
                  count: "exact",
                },
              )
              .in(
                "competency_id",
                competencies.data.map((item) => item.id),
              )
              .order("assessed_at", { ascending: false })
              .order("id"),
          )
        : { data: [] };
      return {
        competencies: competencies.data,
        learners: learners.data ?? [],
        evidence: evidence.data,
      };
    },
  });
  const save = async (operation: () => PromiseLike<{ error: unknown }>) => {
    if (busy) return;
    setBusy(true);
    try {
      const result = await operation();
      if (result.error) throw result.error;
      await queryClient.invalidateQueries({ queryKey: ["competency-workspace", courseId] });
      toast.success("Assessment workspace updated.");
    } catch (error) {
      toast.error(friendlyError(error, "Could not save assessment details."));
    } finally {
      setBusy(false);
    }
  };
  const selectClass = "w-full rounded-md border border-input bg-background px-3 py-2 text-sm";
  return (
    <Phone>
      <Header />
      <Sheet>
        <CanvasHeading
          eyebrow={course.data?.title ?? "Course Studio"}
          title="Competency assessment"
        />
        <Link
          to="/studio/$id"
          params={{ id: courseId }}
          className="mt-3 inline-block text-sm font-semibold text-primary"
        >
          Back to course
        </Link>
        {!user ? (
          <p className="py-8">Sign in to assess learners.</p>
        ) : course.isLoading ? (
          <p className="py-8">Checking course access…</p>
        ) : !owner ? (
          <p role="alert" className="py-8">
            Only the course author can manage assessment.
          </p>
        ) : (
          <div className="mt-6 grid gap-8 pb-10 lg:grid-cols-2">
            <CompetencyRubric
              key={courseId}
              courseId={courseId}
              competencies={workspace.data?.competencies ?? []}
              learners={workspace.data?.learners ?? []}
            />
            {workspace.error && (
              <p role="alert" className="col-span-full text-destructive">
                Could not load assessment records.
              </p>
            )}
            <section className="space-y-4">
              <h2 className="font-semibold">Course competencies</h2>
              <form
                className="space-y-3"
                onSubmit={(event) => {
                  event.preventDefault();
                  void save(() =>
                    supabase.rpc("add_course_competency", {
                      _course: courseId,
                      _code: code.trim(),
                      _title: title.trim(),
                      _description: description,
                    }),
                  );
                }}
              >
                <Input
                  aria-label="Competency code"
                  placeholder="Code, e.g. SAFE-01"
                  required
                  maxLength={40}
                  value={code}
                  onChange={(event) => setCode(event.target.value)}
                />
                <Input
                  aria-label="Competency title"
                  placeholder="Competency title"
                  required
                  minLength={3}
                  maxLength={200}
                  value={title}
                  onChange={(event) => setTitle(event.target.value)}
                />
                <Textarea
                  aria-label="Competency description"
                  placeholder="What must the learner demonstrate?"
                  maxLength={2000}
                  value={description}
                  onChange={(event) => setDescription(event.target.value)}
                />
                <Button disabled={busy || workspace.isLoading}>Add competency</Button>
              </form>
              {workspace.data?.competencies.map((item) => (
                <article key={item.id} className="rounded-xl border p-3">
                  <p className="font-medium">
                    {item.code} · {item.title}
                  </p>
                  <p className="text-sm text-muted-foreground">{item.description}</p>
                </article>
              ))}
            </section>
            <section className="space-y-4">
              <h2 className="font-semibold">Record trainer assessment</h2>
              <p className="text-sm text-muted-foreground">
                Record an observed assessment with supporting notes. Each assessment is retained as
                a separate history entry. This does not automatically issue a certificate.
              </p>
              <form
                className="space-y-3"
                onSubmit={(event) => {
                  event.preventDefault();
                  void save(() =>
                    supabase.rpc("record_competency_assessment", {
                      _competency: competency,
                      _learner: learner,
                      _achieved: achieved,
                      _score: Number(score),
                      _notes: notes.trim(),
                    }),
                  );
                }}
              >
                <select
                  required
                  aria-label="Competency to assess"
                  className={selectClass}
                  value={competency}
                  onChange={(event) => setCompetency(event.target.value)}
                >
                  <option value="">Choose competency</option>
                  {workspace.data?.competencies.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.code} · {item.title}
                    </option>
                  ))}
                </select>
                <select
                  required
                  aria-label="Learner to assess"
                  className={selectClass}
                  value={learner}
                  onChange={(event) => setLearner(event.target.value)}
                >
                  <option value="">Choose eligible learner</option>
                  {workspace.data?.learners.map((item) => (
                    <option key={item.user_id} value={item.user_id}>
                      {item.full_name || "Learner"} · {item.user_id.slice(0, 8)}
                    </option>
                  ))}
                </select>
                <label className="block text-sm">
                  Score (%)
                  <Input
                    type="number"
                    required
                    min={0}
                    max={100}
                    step="0.01"
                    value={score}
                    onChange={(event) => setScore(event.target.value)}
                  />
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={achieved}
                    onChange={(event) => setAchieved(event.target.checked)}
                  />
                  Competency demonstrated
                </label>
                <Textarea
                  aria-label="Assessment evidence and feedback"
                  placeholder="Describe the observed evidence and give learner feedback (at least 10 characters)."
                  required
                  minLength={10}
                  maxLength={2000}
                  value={notes}
                  onChange={(event) => setNotes(event.target.value)}
                />
                <Button disabled={busy || workspace.isLoading || !competency || !learner}>
                  Record assessment
                </Button>
              </form>
            </section>
            <section className="space-y-3 lg:col-span-2">
              <h2 className="font-semibold">Assessment history</h2>
              {workspace.data?.evidence.map((item) => (
                <article key={item.id} className="rounded-xl border p-4">
                  <p className="font-medium">
                    {
                      workspace.data.competencies.find((entry) => entry.id === item.competency_id)
                        ?.title
                    }{" "}
                    ·{" "}
                    {workspace.data.learners.find((entry) => entry.user_id === item.user_id)
                      ?.full_name ?? "Learner"}
                  </p>
                  <p className="text-sm">
                    {item.achieved ? "Demonstrated" : "Not yet demonstrated"} · {item.score}%
                  </p>
                  <p className="whitespace-pre-wrap text-sm text-muted-foreground">{item.notes}</p>
                  <RubricBreakdown snapshot={item.competency_rubric_assessments} />
                </article>
              ))}
            </section>
          </div>
        )}
      </Sheet>
    </Phone>
  );
}
