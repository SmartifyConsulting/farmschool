import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import { toast } from "sonner";
import { Phone, Header, Sheet, CanvasHeading, useIsAdmin } from "@/components/AppShell";
import { AdminNav } from "@/components/AdminNav";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useLearning";
import { friendlyError } from "@/lib/friendly-error";
import { pageMeta } from "@/lib/page-meta";

export const Route = createFileRoute("/admin/grade-moderation")({
  component: ModerationPage,
  head: () => pageMeta("Grade moderation — Plusticity", "Review proposed course grade changes."),
});
const queue = z.object({
  total: z.number(),
  records: z.array(
    z.object({
      id: z.string(),
      course_id: z.string(),
      user_id: z.string(),
      score: z.number(),
      reason: z.string(),
      proposed_at: z.string(),
      proposed_by: z.string(),
      scheme_version: z.number(),
      title: z.string(),
      learner_name: z.string(),
      author_name: z.string(),
    }),
  ),
});

function ModerationPage() {
  const { user, ready } = useAuth();
  const admin = useIsAdmin();
  const qc = useQueryClient();
  const [page, setPage] = useState(0);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const report = useQuery({
    queryKey: ["grade-moderation", user?.id, page],
    enabled: !!user && admin,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("grade_moderation_queue", { _offset: page * 50 });
      if (error) throw error;
      return queue.parse(data);
    },
  });
  const review = async (id: string, approve: boolean) => {
    if (busy) return;
    const note = notes[id]?.trim() ?? "";
    if (note.length < 20) {
      toast.error("Give a review note of at least 20 characters.");
      return;
    }
    setBusy(true);
    try {
      const { error } = await supabase.rpc("review_course_grade", {
        _decision: id,
        _approve: approve,
        _note: note,
      });
      if (error) throw error;
      if (report.data?.records.length === 1 && page > 0) setPage(page - 1);
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["grade-moderation"] }),
        qc.invalidateQueries({ queryKey: ["course-gradebook"] }),
        qc.invalidateQueries({ queryKey: ["grade-decisions"] }),
      ]);
      toast.success(approve ? "Grade override approved." : "Grade proposal rejected.");
    } catch (error) {
      toast.error(friendlyError(error));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Phone>
      <Header />
      <Sheet>
        <CanvasHeading eyebrow="Administration" title="Grade moderation" />
        {!ready ? (
          <p>Checking access…</p>
        ) : !user ? (
          <Link to="/auth">Sign in</Link>
        ) : !admin ? (
          <p>Administrator access required.</p>
        ) : (
          <div className="mt-4 space-y-4">
            <AdminNav />
            <p className="text-sm text-muted-foreground">
              Review the author’s evidence and rationale. You cannot approve or reject your own
              proposals. Changes affect the reported final grade; certificate completion rules
              remain separate.
            </p>
            {report.isPending ? (
              <p>Loading proposals…</p>
            ) : report.isError ? (
              <p role="alert">Could not load grade proposals.</p>
            ) : (
              <>
                {!report.data.records.length && <p>No pending proposals on this page.</p>}
                {report.data.records.map((item) => (
                  <article key={item.id} className="space-y-3 rounded-xl border p-4">
                    <h2 className="font-semibold">
                      {item.title} · {item.learner_name}
                    </h2>
                    <p className="text-sm">
                      Proposed grade: {item.score}% · {item.author_name} · grading version{" "}
                      {item.scheme_version}
                    </p>
                    <p className="whitespace-pre-wrap text-sm">{item.reason}</p>
                    {item.proposed_by === user.id ? (
                      <p className="text-sm text-muted-foreground">
                        Another administrator must review your proposal.
                      </p>
                    ) : (
                      <>
                        <Textarea
                          aria-label={`Review note for ${item.learner_name}`}
                          maxLength={2000}
                          value={notes[item.id] ?? ""}
                          onChange={(e) => setNotes({ ...notes, [item.id]: e.target.value })}
                          disabled={busy}
                          placeholder="Review note (20–2000 characters)"
                        />
                        <div className="flex gap-2">
                          <Button disabled={busy} onClick={() => review(item.id, true)}>
                            Approve override
                          </Button>
                          <Button
                            disabled={busy}
                            variant="outline"
                            onClick={() => review(item.id, false)}
                          >
                            Reject proposal
                          </Button>
                        </div>
                      </>
                    )}
                  </article>
                ))}
                <div className="flex items-center gap-3">
                  <Button
                    disabled={page === 0 || busy}
                    variant="outline"
                    onClick={() => setPage(page - 1)}
                  >
                    Previous
                  </Button>
                  <span className="text-sm">
                    Page {page + 1} · {report.data.total} pending
                  </span>
                  <Button
                    disabled={(page + 1) * 50 >= report.data.total || busy}
                    variant="outline"
                    onClick={() => setPage(page + 1)}
                  >
                    Next
                  </Button>
                </div>
              </>
            )}
          </div>
        )}
      </Sheet>
    </Phone>
  );
}
