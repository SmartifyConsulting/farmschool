import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { Lock, Pin, Trash2 } from "lucide-react";
import { Phone, Header, Sheet, CanvasHeading, useIsAdmin } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useConfirm } from "@/components/ConfirmDialog";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useLearning";
import { friendlyError } from "@/lib/friendly-error";
import { pageMeta } from "@/lib/page-meta";
import { portalSearch } from "@/lib/customer-portal";

export const Route = createFileRoute("/forum/$courseId/$threadId")({
  validateSearch: portalSearch,
  head: () => pageMeta("Thread — Plusticity", "A threaded discussion in this course's forum."),
  component: ThreadPage,
});

type Thread = {
  id: string;
  title: string;
  user_id: string;
  pinned: boolean;
  locked: boolean;
  created_at: string;
};
type Reply = { id: string; user_id: string; body: string; created_at: string };
type Member = { user_id: string; full_name: string | null };

function ThreadPage() {
  const { courseId, threadId } = Route.useParams();
  const { portal } = Route.useSearch();
  const { user } = useAuth();
  const isAdmin = useIsAdmin();
  const navigate = useNavigate();
  const confirm = useConfirm();
  const qc = useQueryClient();
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);

  const { data: thread, isLoading: threadLoading } = useQuery({
    queryKey: ["forum-thread", threadId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("forum_threads")
        .select("id, title, user_id, pinned, locked, created_at")
        .eq("id", threadId)
        .maybeSingle();
      if (error) throw error;
      return data as Thread | null;
    },
  });

  const { data: roster = [] } = useQuery({
    queryKey: ["community-roster", courseId],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("community_roster", { _course_id: courseId });
      if (error) throw error;
      return (data ?? []) as Member[];
    },
  });

  const { data: replies = [], isLoading: repliesLoading } = useQuery({
    queryKey: ["forum-replies", threadId],
    refetchInterval: 20000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("forum_replies")
        .select("id, user_id, body, created_at")
        .eq("thread_id", threadId)
        .order("created_at", { ascending: true })
        .limit(500);
      if (error) throw error;
      return (data ?? []) as Reply[];
    },
  });

  const nameFor = (userId: string) =>
    userId === thread?.user_id && roster.find((m) => m.user_id === userId) === undefined
      ? "Learner"
      : roster.find((m) => m.user_id === userId)?.full_name || "Learner";

  const refreshThread = () =>
    Promise.all([
      qc.invalidateQueries({ queryKey: ["forum-replies", threadId] }),
      qc.invalidateQueries({ queryKey: ["forum-threads", courseId] }),
      qc.invalidateQueries({ queryKey: ["forum-thread", threadId] }),
    ]);

  const reply = async () => {
    const body = draft.trim();
    if (!body || busy) return;
    setBusy(true);
    try {
      const { error } = await supabase
        .from("forum_replies")
        .insert({ thread_id: threadId, body: body.slice(0, 4000) });
      if (error) throw error;
      setDraft("");
      await refreshThread();
    } catch (error) {
      toast.error(friendlyError(error, "Could not post your reply."));
    } finally {
      setBusy(false);
    }
  };

  const setState = async (pinned: boolean, locked: boolean) => {
    setBusy(true);
    try {
      const { error } = await supabase.rpc("forum_set_thread_state", {
        _thread_id: threadId,
        _pinned: pinned,
        _locked: locked,
      });
      if (error) throw error;
      await refreshThread();
    } catch (error) {
      toast.error(friendlyError(error, "Could not update this thread."));
    } finally {
      setBusy(false);
    }
  };

  const deleteThread = async () => {
    if (!(await confirm({ title: "Delete this thread?", description: "This removes the thread and all its replies." })))
      return;
    setBusy(true);
    try {
      const { error } = await supabase.rpc("forum_delete_thread", { _thread_id: threadId });
      if (error) throw error;
      toast.success("Thread removed.");
      navigate({ to: "/forum/$courseId", params: { courseId }, search: portal ? { portal } : {} });
    } catch (error) {
      toast.error(friendlyError(error, "Could not delete this thread."));
      setBusy(false);
    }
  };

  const deleteReply = async (id: string) => {
    if (!(await confirm({ title: "Delete this reply?", description: "This cannot be undone." }))) return;
    setBusy(true);
    try {
      const { error } = await supabase.rpc("forum_delete_reply", { _reply_id: id });
      if (error) throw error;
      await refreshThread();
    } catch (error) {
      toast.error(friendlyError(error, "Could not delete this reply."));
    } finally {
      setBusy(false);
    }
  };

  const canModerate = (ownerId: string) => isAdmin || ownerId === user?.id;

  return (
    <Phone>
      <Header />
      <Sheet>
        <div className="mb-2">
          <Link to="/forum/$courseId" params={{ courseId }} search={portal ? { portal } : {}} className="text-sm font-semibold text-primary">
            ← Back to forum
          </Link>
        </div>
        {threadLoading ? (
          <p className="py-10 text-center text-sm text-muted-foreground">Loading thread…</p>
        ) : !thread ? (
          <p className="py-10 text-center text-sm text-muted-foreground">This thread no longer exists.</p>
        ) : (
          <>
            <CanvasHeading
              eyebrow={thread.pinned ? "Pinned thread" : "Thread"}
              title={thread.title}
            />
            {isAdmin && (
              <div className="mt-2 flex flex-wrap gap-2">
                <Button size="sm" variant="outline" disabled={busy} onClick={() => setState(!thread.pinned, thread.locked)}>
                  <Pin className="mr-1.5 h-3.5 w-3.5" />
                  {thread.pinned ? "Unpin" : "Pin"}
                </Button>
                <Button size="sm" variant="outline" disabled={busy} onClick={() => setState(thread.pinned, !thread.locked)}>
                  <Lock className="mr-1.5 h-3.5 w-3.5" />
                  {thread.locked ? "Unlock" : "Lock"}
                </Button>
                <Button size="sm" variant="outline" disabled={busy} onClick={deleteThread}>
                  <Trash2 className="mr-1.5 h-3.5 w-3.5" />
                  Delete thread
                </Button>
              </div>
            )}
            {repliesLoading ? (
              <p className="py-8 text-center text-sm text-muted-foreground">Loading replies…</p>
            ) : (
              <ul className="mt-4 space-y-4">
                {replies.map((r) => (
                  <li key={r.id} className="rounded-xl border border-border p-3">
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-xs font-semibold text-muted-foreground">
                        {r.user_id === user?.id ? "You" : nameFor(r.user_id)} ·{" "}
                        {new Date(r.created_at).toLocaleString()}
                      </p>
                      {canModerate(r.user_id) && (
                        <button
                          type="button"
                          aria-label="Delete reply"
                          className="text-muted-foreground hover:text-destructive"
                          disabled={busy}
                          onClick={() => deleteReply(r.id)}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>
                    <p className="mt-1 whitespace-pre-wrap text-sm">{r.body}</p>
                  </li>
                ))}
                {!replies.length && (
                  <p className="py-6 text-center text-sm text-muted-foreground">
                    No replies yet — be the first to respond.
                  </p>
                )}
              </ul>
            )}
            {thread.locked ? (
              <p className="mt-4 text-sm text-muted-foreground">This thread is locked; new replies are disabled.</p>
            ) : (
              <div className="mt-4 space-y-2">
                <Textarea
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  placeholder="Write a reply"
                  aria-label="Write a reply"
                  maxLength={4000}
                  disabled={busy}
                />
                <Button onClick={reply} disabled={busy || !draft.trim()}>
                  Post reply
                </Button>
              </div>
            )}
          </>
        )}
      </Sheet>
    </Phone>
  );
}
