import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Send, Users } from "lucide-react";
import { Phone, Header, Sheet, CanvasHeading } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useLearning";
import { friendlyError } from "@/lib/friendly-error";
import { pageMeta } from "@/lib/page-meta";
import { toast } from "sonner";
import { portalSearch } from "@/lib/customer-portal";

export const Route = createFileRoute("/community/$courseId")({
  validateSearch: portalSearch,
  head: () =>
    pageMeta(
      "Course community — Plusticity",
      "Chat with others who completed this course.",
    ),
  component: CommunityPage,
});

type Message = { id: string; user_id: string; body: string; created_at: string };
type Member = { user_id: string; full_name: string | null; joined_at: string };

function CommunityPage() {
  const { courseId } = Route.useParams();
  const { portal } = Route.useSearch();
  const { user, ready } = useAuth();
  const qc = useQueryClient();
  const [draft, setDraft] = useState("");

  const { data: course } = useQuery({
    queryKey: ["community-course", courseId],
    queryFn: async () =>
      (await supabase.from("studio_courses").select("title").eq("id", courseId).maybeSingle())
        .data,
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

  const { data: roster = [] } = useQuery({
    queryKey: ["community-roster", courseId],
    enabled: !!joined,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("community_roster", { _course_id: courseId });
      if (error) throw error;
      return (data ?? []) as Member[];
    },
  });

  const { data: messages = [] } = useQuery({
    queryKey: ["community-messages", courseId],
    enabled: !!joined,
    refetchInterval: 30000,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: true,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("community_messages")
        .select("id, user_id, body, created_at")
        .eq("course_id", courseId)
        .order("created_at", { ascending: false })
        .limit(200);
      if (error) throw error;
      return ((data ?? []) as Message[]).reverse();
    },
  });

  const nameFor = (userId: string) =>
    roster.find((m) => m.user_id === userId)?.full_name || "Learner";

  const send = async () => {
    const body = draft.trim();
    if (!body) return;
    setDraft("");
    const { error } = await supabase
      .from("community_messages")
      .insert({ course_id: courseId, body: body.slice(0, 2000) });
    if (error) {
      toast.error(friendlyError(error, "Could not send your message."));
      return;
    }
    qc.invalidateQueries({ queryKey: ["community-messages", courseId] });
  };

  if (ready && !user)
    return (
      <Phone>
        <Header />
        <Sheet>
          <CanvasHeading title="Course community" />
          <p className="py-10 text-center text-sm text-muted-foreground">
            <Link to="/auth" search={portal ? { portal } : {}} className="font-semibold text-primary">
              Sign in
            </Link>{" "}
            to join this course's community.
          </p>
        </Sheet>
      </Phone>
    );

  return (
    <Phone>
      <Header />
      <Sheet>
        <CanvasHeading eyebrow={course?.title ?? "Community"} title="Course community" />
        <div className="mt-2">
          <Link to="/forum/$courseId" params={{ courseId }} search={portal ? { portal } : {}} className="text-sm font-semibold text-primary">
            Open discussion forum
          </Link>
        </div>
        {portal && <p className="mb-3 text-sm text-muted-foreground">This community is shared by eligible learners of this course. For shared courses, learners may come from other organizations. Personal messages belong to your learner account.</p>}
        {joining ? (
          <p className="py-10 text-center text-sm text-muted-foreground">Checking access…</p>
        ) : joinError ? (
          <p className="py-10 text-center text-sm text-muted-foreground">
            {friendlyError(joinError, "Finish this course to join its community.")}
          </p>
        ) : (
          <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1fr)_260px]">
            <div className="flex min-h-[420px] flex-col rounded-xl border border-border">
              <div className="flex-1 space-y-3 overflow-y-auto p-4">
                {messages.length === 0 && (
                  <p className="py-8 text-center text-sm text-muted-foreground">
                    No messages yet — say hello to the group.
                  </p>
                )}
                {messages.map((m) => (
                  <div key={m.id} className={m.user_id === user?.id ? "text-right" : ""}>
                    <p className="text-[11px] text-muted-foreground">
                      {m.user_id === user?.id ? "You" : nameFor(m.user_id)} ·{" "}
                      {new Date(m.created_at).toLocaleString()}
                    </p>
                    <p
                      className={`mt-0.5 inline-block max-w-[85%] rounded-xl px-3 py-2 text-sm ${m.user_id === user?.id ? "bg-primary text-primary-foreground" : "bg-muted"}`}
                    >
                      {m.body}
                    </p>
                  </div>
                ))}
              </div>
              <div className="flex gap-2 border-t border-border p-3">
                <Input
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      send();
                    }
                  }}
                  placeholder="Message the group"
                  aria-label="Message the group"
                  maxLength={2000}
                />
                <Button size="icon" onClick={send} disabled={!draft.trim()} aria-label="Send">
                  <Send className="h-4 w-4" />
                </Button>
              </div>
            </div>
            <div>
              <h2 className="flex items-center gap-1.5 text-sm font-semibold">
                <Users className="h-4 w-4" />
                Members ({roster.length})
              </h2>
              <ul className="mt-2 space-y-2">
                {roster.map((m) => (
                  <li
                    key={m.user_id}
                    className="flex items-center justify-between gap-2 rounded-lg border border-border p-2"
                  >
                    <span className="min-w-0 truncate text-sm">
                      {m.user_id === user?.id ? "You" : m.full_name || "Learner"}
                    </span>
                    {m.user_id !== user?.id && (
                      <Button asChild size="sm" variant="ghost">
                        <Link to="/messages/$partnerId" params={{ partnerId: m.user_id }} search={portal ? { portal } : {}}>
                          Message
                        </Link>
                      </Button>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        )}
      </Sheet>
    </Phone>
  );
}
