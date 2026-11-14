import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { MessageSquare, Pin } from "lucide-react";
import { Phone, Header, Sheet, CanvasHeading } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useLearning";
import { friendlyError } from "@/lib/friendly-error";
import { pageMeta } from "@/lib/page-meta";
import { portalSearch } from "@/lib/customer-portal";

export const Route = createFileRoute("/forum/$courseId")({
  validateSearch: portalSearch,
  head: () => pageMeta("Course forum — Plusticity", "Threaded discussion for this course's community."),
  component: ForumPage,
});

type Thread = {
  id: string;
  title: string;
  user_id: string;
  pinned: boolean;
  locked: boolean;
  created_at: string;
  last_activity_at: string;
};

function ForumPage() {
  const { courseId } = Route.useParams();
  const { portal } = Route.useSearch();
  const { user, ready } = useAuth();
  const qc = useQueryClient();
  const [title, setTitle] = useState("");
  const [busy, setBusy] = useState(false);

  const { data: course } = useQuery({
    queryKey: ["forum-course", courseId],
    queryFn: async () =>
      (await supabase.from("studio_courses").select("title").eq("id", courseId).maybeSingle()).data,
  });

  const {
    data: joined,
    isLoading: joining,
    error: joinError,
  } = useQuery({
    queryKey: ["community-join", courseId, user?.id],
    enabled: !!user,
    retry: false,
    queryFn: async () => {
      const { error } = await supabase.rpc("community_join", { _course_id: courseId });
      if (error) throw error;
      return true;
    },
  });

  const { data: threads = [], isLoading } = useQuery({
    queryKey: ["forum-threads", courseId],
    enabled: !!joined,
    refetchInterval: 30000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("forum_threads")
        .select("id, title, user_id, pinned, locked, created_at, last_activity_at")
        .eq("course_id", courseId)
        .order("pinned", { ascending: false })
        .order("last_activity_at", { ascending: false })
        .limit(200);
      if (error) throw error;
      return (data ?? []) as Thread[];
    },
  });

  const startThread = async () => {
    const value = title.trim();
    if (value.length < 3 || busy) {
      if (value.length < 3) toast.error("Give the thread a title of at least 3 characters.");
      return;
    }
    setBusy(true);
    try {
      const { error } = await supabase
        .from("forum_threads")
        .insert({ course_id: courseId, title: value });
      if (error) throw error;
      setTitle("");
      await qc.invalidateQueries({ queryKey: ["forum-threads", courseId] });
      toast.success("Thread started.");
    } catch (error) {
      toast.error(friendlyError(error, "Could not start this thread."));
    } finally {
      setBusy(false);
    }
  };

  if (ready && !user)
    return (
      <Phone>
        <Header />
        <Sheet>
          <CanvasHeading title="Course forum" />
          <p className="py-10 text-center text-sm text-muted-foreground">
            <Link to="/auth" search={portal ? { portal } : {}} className="font-semibold text-primary">
              Sign in
            </Link>{" "}
            to join this course's forum.
          </p>
        </Sheet>
      </Phone>
    );

  return (
    <Phone>
      <Header />
      <Sheet>
        <CanvasHeading eyebrow={course?.title ?? "Forum"} title="Course forum" />
        <div className="mt-2">
          <Link to="/community/$courseId" params={{ courseId }} search={portal ? { portal } : {}} className="text-sm font-semibold text-primary">
            Open live chat
          </Link>
        </div>
        {joining ? (
          <p className="py-10 text-center text-sm text-muted-foreground">Checking access…</p>
        ) : joinError ? (
          <p className="py-10 text-center text-sm text-muted-foreground">
            {friendlyError(joinError, "Finish this course to join its forum.")}
          </p>
        ) : (
          <>
            <div className="mt-4 flex gap-2">
              <Input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Start a new thread"
                aria-label="New thread title"
                maxLength={200}
                disabled={busy}
              />
              <Button onClick={startThread} disabled={busy || title.trim().length < 3}>
                Post
              </Button>
            </div>
            {isLoading ? (
              <p className="py-8 text-center text-sm text-muted-foreground">Loading threads…</p>
            ) : !threads.length ? (
              <p className="py-8 text-center text-sm text-muted-foreground">
                No threads yet — start the first discussion.
              </p>
            ) : (
              <ul className="mt-4 divide-y divide-border">
                {threads.map((thread) => (
                  <li key={thread.id} className="py-3">
                    <Link
                      to="/forum/$courseId/$threadId"
                      params={{ courseId, threadId: thread.id }}
                      search={portal ? { portal } : {}}
                      className="flex items-start gap-2 hover:text-primary"
                    >
                      <MessageSquare aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                      <span className="min-w-0 flex-1">
                        <span className="flex flex-wrap items-center gap-1.5 text-sm font-semibold">
                          {thread.pinned && <Pin aria-hidden="true" className="h-3.5 w-3.5 text-primary" />}
                          {thread.title}
                          {thread.locked && (
                            <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-semibold text-muted-foreground">
                              Locked
                            </span>
                          )}
                        </span>
                        <span className="block text-xs text-muted-foreground">
                          Last activity {new Date(thread.last_activity_at).toLocaleString()}
                        </span>
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </Sheet>
    </Phone>
  );
}
