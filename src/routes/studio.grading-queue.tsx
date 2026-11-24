import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { ArrowLeft, Camera, Check, Loader2, X } from "lucide-react";
import { Phone, Header, Sheet, CanvasHeading } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useLearning";
import { toast } from "sonner";
import { friendlyError } from "@/lib/friendly-error";
import { PHOTO_EVIDENCE_BUCKET, reviewPracticalPhoto } from "@/lib/practical-evidence.functions";
import { pageMeta } from "@/lib/page-meta";

export const Route = createFileRoute("/studio/grading-queue")({
  head: () => pageMeta("Grading queue — Plusticity", "Practical-task submissions awaiting your review, across all your courses."),
  component: GradingQueuePage,
});

type QueueItem = {
  id: string;
  user_id: string;
  photo_path: string;
  trainer_note: string | null;
  created_at: string;
  lesson_id: string;
  lesson_title: string;
  course_id: string;
  course_title: string;
  learner_name: string;
};

/** Every pending practical-task photo submission across every course this trainer authors — today,
 * reviewing one meant opening that exact lesson; this gives one place to work through the backlog. */
function GradingQueuePage() {
  const { user, ready } = useAuth();
  const qc = useQueryClient();
  const review = useServerFn(reviewPracticalPhoto);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [busyId, setBusyId] = useState<string | null>(null);

  const { data: items, isLoading } = useQuery({
    queryKey: ["grading-queue", user?.id],
    enabled: !!user,
    queryFn: async (): Promise<QueueItem[]> => {
      const { data: courses } = await supabase
        .from("studio_courses")
        .select("id, title")
        .eq("author_id", user!.id);
      const courseIds = (courses ?? []).map((c) => c.id);
      if (!courseIds.length) return [];
      const courseTitleById = new Map((courses ?? []).map((c) => [c.id, c.title]));
      const { data: lessons } = await supabase
        .from("studio_lessons")
        .select("id, title, course_id")
        .in("course_id", courseIds);
      const lessonById = new Map((lessons ?? []).map((l) => [l.id, l]));
      const lessonIds = (lessons ?? []).map((l) => l.id);
      if (!lessonIds.length) return [];
      const { data: submissions, error } = await supabase
        .from("lesson_photo_submissions")
        .select("id, user_id, photo_path, trainer_note, created_at, lesson_id")
        .eq("status", "pending")
        .in("lesson_id", lessonIds)
        .order("created_at", { ascending: true });
      if (error) throw error;
      if (!submissions?.length) return [];
      const userIds = [...new Set(submissions.map((s) => s.user_id))];
      const { data: profiles } = await supabase
        .from("profiles" as never)
        .select("user_id, first_name, last_name, full_name" as never)
        .in("user_id" as never, userIds);
      const nameById = new Map(
        ((profiles ?? []) as unknown as { user_id: string; first_name: string; last_name: string; full_name: string }[]).map((p) => [
          p.user_id,
          [p.first_name, p.last_name].filter(Boolean).join(" ").trim() || p.full_name || "A learner",
        ]),
      );
      return submissions.flatMap((s) => {
        const lesson = lessonById.get(s.lesson_id);
        if (!lesson) return [];
        return [{
          id: s.id,
          user_id: s.user_id,
          photo_path: s.photo_path,
          trainer_note: s.trainer_note,
          created_at: s.created_at,
          lesson_id: lesson.id,
          lesson_title: lesson.title,
          course_id: lesson.course_id,
          course_title: courseTitleById.get(lesson.course_id) ?? "Course",
          learner_name: nameById.get(s.user_id) ?? "A learner",
        }];
      });
    },
  });

  const decide = async (item: QueueItem, status: "approved" | "rejected") => {
    setBusyId(item.id);
    try {
      const result = await review({ data: { submissionId: item.id, status, note: notes[item.id]?.trim() ?? "" } });
      if ("error" in result) throw new Error(result.error);
      toast.success(status === "approved" ? "Signed off." : "Rejected — the learner can resubmit.");
      void qc.invalidateQueries({ queryKey: ["grading-queue"] });
    } catch (e) {
      toast.error(friendlyError(e, "Could not save this review."));
    } finally {
      setBusyId(null);
    }
  };

  return (
    <Phone>
      <Header />
      <Sheet wide>
        <div className="mb-4 flex items-center gap-2">
          <Link to="/studio" className="text-muted-foreground hover:text-foreground">
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <CanvasHeading eyebrow="For trainers" title="Grading queue" />
        </div>
        {!ready || isLoading ? (
          <p className="py-10 text-center text-sm text-muted-foreground"><Loader2 className="mx-auto h-5 w-5 animate-spin" /></p>
        ) : !user ? (
          <p className="py-10 text-center text-sm"><Link to="/auth" className="font-semibold text-primary">Sign in</Link> to view your grading queue.</p>
        ) : !items?.length ? (
          <p className="flex flex-col items-center gap-2 py-10 text-center text-sm text-muted-foreground">
            <Camera className="h-8 w-8" />
            No submissions awaiting grade.
          </p>
        ) : (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">{items.length} practical-task submission{items.length === 1 ? "" : "s"} awaiting review, across all your courses.</p>
            {items.map((item) => (
              <GradingRow
                key={item.id}
                item={item}
                note={notes[item.id] ?? ""}
                onNote={(v) => setNotes((p) => ({ ...p, [item.id]: v }))}
                busy={busyId === item.id}
                onDecide={(status) => void decide(item, status)}
              />
            ))}
          </div>
        )}
      </Sheet>
    </Phone>
  );
}

function GradingRow({ item, note, onNote, busy, onDecide }: {
  item: QueueItem;
  note: string;
  onNote: (v: string) => void;
  busy: boolean;
  onDecide: (status: "approved" | "rejected") => void;
}) {
  const { data: photoUrl } = useQuery({
    queryKey: ["grading-queue-photo", item.photo_path],
    queryFn: async () => (await supabase.storage.from(PHOTO_EVIDENCE_BUCKET).createSignedUrl(item.photo_path, 300)).data?.signedUrl ?? null,
  });
  return (
    <div className="flex flex-col gap-3 rounded-lg border border-border p-3 sm:flex-row">
      {photoUrl && <img src={photoUrl} alt="" className="h-32 w-full shrink-0 rounded-md object-cover sm:w-40" />}
      <div className="min-w-0 flex-1 space-y-2">
        <p className="text-sm font-medium">
          {item.learner_name} ·{" "}
          <Link to="/studio/$id" params={{ id: item.course_id }} className="text-primary hover:underline">{item.course_title}</Link>
          {" · "}{item.lesson_title}
        </p>
        <p className="text-xs text-muted-foreground">Submitted {new Date(item.created_at).toLocaleString()}</p>
        <Textarea
          aria-label={`Review note for ${item.learner_name}`}
          placeholder="Optional note for the learner"
          value={note}
          onChange={(e) => onNote(e.target.value)}
          disabled={busy}
          rows={2}
          maxLength={1000}
          className="resize-none text-sm"
        />
        <div className="flex gap-2">
          <Button size="sm" disabled={busy} onClick={() => onDecide("approved")}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}Sign off
          </Button>
          <Button size="sm" variant="outline" disabled={busy} onClick={() => onDecide("rejected")}>
            <X className="h-4 w-4" />Reject
          </Button>
        </div>
      </div>
    </div>
  );
}
