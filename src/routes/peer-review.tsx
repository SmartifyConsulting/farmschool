import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { Phone, Header, Sheet, CanvasHeading } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useLearning";
import { friendlyError } from "@/lib/friendly-error";
import { pageMeta } from "@/lib/page-meta";

export const Route = createFileRoute("/peer-review")({
  head: () => pageMeta("Peer review queue — Plusticity", "Review your assigned peer submissions."),
  component: PeerReviewQueue,
});

type Criterion = { id: string; title: string; maxPoints: number };
type QueueItem = {
  review_assignment_id: string;
  assignment_id: string;
  assignment_title: string;
  rubric: Criterion[];
  submission_id: string;
  submission_body: string;
  status: "pending" | "completed";
};

function PeerReviewQueue() {
  const { user, ready } = useAuth();
  const qc = useQueryClient();

  const { data: queue = [], isLoading, error } = useQuery({
    queryKey: ["peer-review-queue", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("my_peer_review_queue");
      if (error) throw error;
      return (data ?? []) as unknown as QueueItem[];
    },
  });

  const pending = queue.filter((q) => q.status === "pending");
  const completed = queue.filter((q) => q.status === "completed");

  return (
    <Phone>
      <Header />
      <Sheet>
        <CanvasHeading title="Peer review queue" />
        {!ready || (user && isLoading) ? (
          <p className="py-8 text-center text-sm text-muted-foreground">Loading your queue…</p>
        ) : !user ? (
          <p className="py-8 text-center text-sm text-muted-foreground">
            <Link to="/auth" className="font-semibold text-primary">
              Sign in
            </Link>{" "}
            to review your assigned submissions.
          </p>
        ) : error ? (
          <p role="alert" className="py-8 text-center text-sm text-destructive">
            Could not load your review queue.
          </p>
        ) : (
          <>
            <h2 className="mt-4 text-sm font-semibold">Pending ({pending.length})</h2>
            {!pending.length ? (
              <p className="py-4 text-sm text-muted-foreground">Nothing waiting on you right now.</p>
            ) : (
              <ul className="mt-2 space-y-4">
                {pending.map((item) => (
                  <ReviewCard
                    key={item.review_assignment_id}
                    item={item}
                    onReviewed={() => qc.invalidateQueries({ queryKey: ["peer-review-queue", user.id] })}
                  />
                ))}
              </ul>
            )}
            {completed.length > 0 && (
              <>
                <h2 className="mt-6 text-sm font-semibold">Completed ({completed.length})</h2>
                <ul className="mt-2 space-y-2">
                  {completed.map((item) => (
                    <li key={item.review_assignment_id} className="rounded-lg border border-border p-3 text-sm text-muted-foreground">
                      {item.assignment_title}
                    </li>
                  ))}
                </ul>
              </>
            )}
          </>
        )}
      </Sheet>
    </Phone>
  );
}

function ReviewCard({ item, onReviewed }: { item: QueueItem; onReviewed: () => void }) {
  const [marks, setMarks] = useState<Record<string, string>>({});
  const [comment, setComment] = useState("");
  const [busy, setBusy] = useState(false);

  const maxPoints = item.rubric.reduce((sum, c) => sum + (c.maxPoints || 0), 0);

  const submit = async () => {
    const parsed: Record<string, number> = {};
    for (const c of item.rubric) {
      const raw = marks[c.id];
      const value = raw === undefined || raw === "" ? NaN : Number(raw);
      if (!Number.isFinite(value) || value < 0 || value > c.maxPoints) {
        toast.error(`Give a score between 0 and ${c.maxPoints} for "${c.title}".`);
        return;
      }
      parsed[c.id] = value;
    }
    const score = Object.values(parsed).reduce((sum, v) => sum + v, 0);
    setBusy(true);
    try {
      const { error } = await supabase.from("peer_reviews").insert({
        review_assignment_id: item.review_assignment_id,
        marks: parsed,
        comment: comment.trim(),
        score,
        max_points: maxPoints,
      });
      if (error) throw error;
      onReviewed();
      toast.success("Review submitted.");
    } catch (error) {
      toast.error(friendlyError(error, "Could not submit your review."));
    } finally {
      setBusy(false);
    }
  };

  return (
    <li className="rounded-xl border border-border p-4">
      <h3 className="font-semibold">{item.assignment_title}</h3>
      <div className="mt-2 rounded-lg bg-muted p-3 text-sm whitespace-pre-wrap">{item.submission_body}</div>
      <div className="mt-3 space-y-2">
        {item.rubric.map((c) => (
          <label key={c.id} className="flex items-center justify-between gap-2 text-sm">
            <span>
              {c.title} (0–{c.maxPoints})
            </span>
            <input
              type="number"
              min={0}
              max={c.maxPoints}
              step="0.5"
              className="w-20 rounded-md border bg-background p-1 text-right"
              value={marks[c.id] ?? ""}
              onChange={(e) => setMarks((m) => ({ ...m, [c.id]: e.target.value }))}
              disabled={busy}
            />
          </label>
        ))}
        <Textarea
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          placeholder="Feedback for this submission"
          aria-label="Feedback"
          disabled={busy}
        />
        <Button size="sm" onClick={submit} disabled={busy}>
          Submit review
        </Button>
      </div>
    </li>
  );
}
