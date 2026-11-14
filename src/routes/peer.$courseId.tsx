import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { Users } from "lucide-react";
import { Phone, Header, Sheet, CanvasHeading } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useLearning";
import { friendlyError } from "@/lib/friendly-error";
import { pageMeta } from "@/lib/page-meta";

export const Route = createFileRoute("/peer/$courseId")({
  head: () => pageMeta("Peer assessment — Plusticity", "Submit work and review your peers' submissions."),
  component: PeerAssessmentPage,
});

type Criterion = { id: string; title: string; maxPoints: number };
type Assignment = {
  id: string;
  title: string;
  instructions: string;
  rubric: Criterion[];
  reviews_required: number;
  author_id: string;
};
type Submission = { id: string; body: string; review_count: number; calibrated_score: number | null };

function maxTotal(rubric: Criterion[]) {
  return rubric.reduce((sum, c) => sum + (c.maxPoints || 0), 0);
}

function PeerAssessmentPage() {
  const { courseId } = Route.useParams();
  const { user } = useAuth();
  const qc = useQueryClient();
  const [newTitle, setNewTitle] = useState("");
  const [newInstructions, setNewInstructions] = useState("");
  const [busy, setBusy] = useState(false);

  const { data: course } = useQuery({
    queryKey: ["peer-course", courseId],
    queryFn: async () =>
      (await supabase.from("studio_courses").select("title,author_id").eq("id", courseId).maybeSingle()).data,
  });
  const isAuthor = !!user && course?.author_id === user.id;

  const { data: assignments = [], isLoading } = useQuery({
    queryKey: ["peer-assignments", courseId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("peer_assignments")
        .select("id,title,instructions,rubric,reviews_required,author_id")
        .eq("course_id", courseId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as Assignment[];
    },
  });

  const { data: mySubmissions = {} } = useQuery({
    queryKey: ["peer-my-submissions", courseId, user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("peer_submissions")
        .select("id,assignment_id,body,review_count,calibrated_score")
        .in("assignment_id", assignments.map((a) => a.id))
        .eq("user_id", user!.id);
      if (error) throw error;
      const map: Record<string, Submission> = {};
      for (const row of data ?? []) map[row.assignment_id as string] = row as unknown as Submission;
      return map;
    },
    enabled: !!user && assignments.length > 0,
  });

  const createAssignment = async () => {
    if (newTitle.trim().length < 3 || busy) return;
    setBusy(true);
    try {
      const rubric: Criterion[] = [
        { id: "clarity", title: "Clarity", maxPoints: 5 },
        { id: "accuracy", title: "Accuracy", maxPoints: 5 },
        { id: "completeness", title: "Completeness", maxPoints: 5 },
      ];
      const { error } = await supabase.from("peer_assignments").insert({
        course_id: courseId,
        title: newTitle.trim(),
        instructions: newInstructions.trim(),
        rubric,
        reviews_required: 2,
      });
      if (error) throw error;
      setNewTitle("");
      setNewInstructions("");
      await qc.invalidateQueries({ queryKey: ["peer-assignments", courseId] });
      toast.success("Peer assignment created.");
    } catch (error) {
      toast.error(friendlyError(error, "Could not create this assignment."));
    } finally {
      setBusy(false);
    }
  };

  const assignReviewers = async (assignmentId: string) => {
    setBusy(true);
    try {
      const { data, error } = await supabase.rpc("peer_assign_reviewers", { _assignment_id: assignmentId });
      if (error) throw error;
      toast.success(`${data ?? 0} review assignment(s) created.`);
    } catch (error) {
      toast.error(friendlyError(error, "Could not assign reviewers."));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Phone>
      <Header />
      <Sheet>
        <CanvasHeading eyebrow={course?.title ?? "Peer assessment"} title="Peer assessment" />
        <div className="mt-2">
          <Link to="/peer-review" className="text-sm font-semibold text-primary">
            Open my review queue
          </Link>
        </div>
        {isAuthor && (
          <section className="mt-4 space-y-2 rounded-xl border p-4">
            <h2 className="font-semibold">New peer assignment</h2>
            <Input
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              placeholder="Assignment title"
              aria-label="Assignment title"
              disabled={busy}
            />
            <Textarea
              value={newInstructions}
              onChange={(e) => setNewInstructions(e.target.value)}
              placeholder="Instructions for learners"
              aria-label="Instructions"
              disabled={busy}
            />
            <Button onClick={createAssignment} disabled={busy || newTitle.trim().length < 3}>
              Create assignment
            </Button>
          </section>
        )}
        {isLoading ? (
          <p className="py-8 text-center text-sm text-muted-foreground">Loading assignments…</p>
        ) : !assignments.length ? (
          <p className="py-8 text-center text-sm text-muted-foreground">No peer assignments yet.</p>
        ) : (
          <ul className="mt-4 space-y-4">
            {assignments.map((a) => (
              <AssignmentCard
                key={a.id}
                assignment={a}
                submission={mySubmissions[a.id]}
                isAuthor={isAuthor}
                busy={busy}
                setBusy={setBusy}
                onAssignReviewers={() => assignReviewers(a.id)}
                onSubmitted={() => qc.invalidateQueries({ queryKey: ["peer-my-submissions", courseId, user?.id] })}
              />
            ))}
          </ul>
        )}
      </Sheet>
    </Phone>
  );
}

function AssignmentCard({
  assignment,
  submission,
  isAuthor,
  busy,
  setBusy,
  onAssignReviewers,
  onSubmitted,
}: {
  assignment: Assignment;
  submission: Submission | undefined;
  isAuthor: boolean;
  busy: boolean;
  setBusy: (v: boolean) => void;
  onAssignReviewers: () => void;
  onSubmitted: () => void;
}) {
  const [body, setBody] = useState("");

  const submit = async () => {
    if (body.trim().length < 1 || busy) return;
    setBusy(true);
    try {
      const { error } = await supabase
        .from("peer_submissions")
        .insert({ assignment_id: assignment.id, body: body.trim() });
      if (error) throw error;
      setBody("");
      onSubmitted();
      toast.success("Submitted for peer review.");
    } catch (error) {
      toast.error(friendlyError(error, "Could not submit your work."));
    } finally {
      setBusy(false);
    }
  };

  return (
    <li className="rounded-xl border border-border p-4">
      <h3 className="font-semibold">{assignment.title}</h3>
      {assignment.instructions && (
        <p className="mt-1 whitespace-pre-wrap text-sm text-muted-foreground">{assignment.instructions}</p>
      )}
      <p className="mt-1 text-xs text-muted-foreground">
        Rubric: {assignment.rubric.map((c) => `${c.title} (${c.maxPoints})`).join(", ")} · Max{" "}
        {maxTotal(assignment.rubric)} · {assignment.reviews_required} reviewer(s) required
      </p>
      {isAuthor && (
        <Button size="sm" variant="outline" className="mt-2" disabled={busy} onClick={onAssignReviewers}>
          <Users className="mr-1.5 h-3.5 w-3.5" />
          Assign reviewers
        </Button>
      )}
      {submission ? (
        <div className="mt-3 rounded-lg bg-muted p-3 text-sm">
          <p className="font-semibold">Your submission</p>
          <p className="mt-1 whitespace-pre-wrap">{submission.body}</p>
          <p className="mt-2 text-xs text-muted-foreground">
            {submission.review_count} review(s) received
            {submission.calibrated_score != null &&
              ` · Calibrated score: ${submission.calibrated_score.toFixed(1)}%`}
          </p>
        </div>
      ) : (
        <div className="mt-3 space-y-2">
          <Textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="Your submission"
            aria-label="Your submission"
            disabled={busy}
          />
          <Button size="sm" onClick={submit} disabled={busy || !body.trim()}>
            Submit
          </Button>
        </div>
      )}
    </li>
  );
}
