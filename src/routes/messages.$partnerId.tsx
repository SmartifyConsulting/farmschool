import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { ArrowLeft, Send } from "lucide-react";
import { Phone, Header, Sheet, CanvasHeading } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useLearning";
import { friendlyError } from "@/lib/friendly-error";
import { toast } from "sonner";

export const Route = createFileRoute("/messages/$partnerId")({
  component: ThreadPage,
});

type DM = {
  id: string;
  sender_id: string;
  recipient_id: string;
  body: string;
  created_at: string;
  read_at: string | null;
};

function ThreadPage() {
  const { partnerId } = Route.useParams();
  const { portal } = Route.useSearch();
  const { user } = useAuth();
  const qc = useQueryClient();
  const [draft, setDraft] = useState("");

  const { data: partner } = useQuery({
    queryKey: ["dm-partner", partnerId],
    queryFn: async () =>
      (await supabase.from("profiles").select("full_name").eq("user_id", partnerId).maybeSingle())
        .data,
  });

  const { data: thread = [] } = useQuery({
    queryKey: ["dm-thread", partnerId],
    enabled: !!user,
    refetchInterval: 20000,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: true,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("direct_messages")
        .select("id, sender_id, recipient_id, body, created_at, read_at")
        .or(
          `and(sender_id.eq.${user!.id},recipient_id.eq.${partnerId}),and(sender_id.eq.${partnerId},recipient_id.eq.${user!.id})`,
        )
        .order("created_at", { ascending: false })
        .limit(200);
      if (error) throw error;
      const ordered = [...(data ?? [])].reverse();
      const unread = ordered.filter((m) => m.recipient_id === user!.id && !m.read_at);
      if (unread.length)
        await supabase
          .from("direct_messages")
          .update({ read_at: new Date().toISOString() })
          .in(
            "id",
            unread.map((m) => m.id),
          );
      return ordered as DM[];
    },
  });

  const send = async () => {
    const body = draft.trim();
    if (!body) return;
    setDraft("");
    const { error } = await supabase.rpc("send_direct_message", {
      _recipient: partnerId,
      _body: body.slice(0, 2000),
    });
    if (error) {
      toast.error(friendlyError(error, "Could not send your message."));
      return;
    }
    qc.invalidateQueries({ queryKey: ["dm-thread", partnerId] });
    qc.invalidateQueries({ queryKey: ["dm-threads"] });
  };

  return (
    <Phone>
      <Header />
      <Sheet>
        <div className="mb-3 flex items-center gap-2">
          <Link
            to="/messages"
            search={portal ? { portal } : {}}
            aria-label="Back to messages"
            className="grid h-8 w-8 place-items-center rounded-md hover:bg-muted"
          >
            <ArrowLeft className="h-4 w-4" />
          </Link>
          <CanvasHeading title={partner?.full_name || "Conversation"} />
        </div>
        {portal && <p className="mb-3 text-sm text-muted-foreground">Personal conversation in your learner account. This thread may include messages exchanged outside this portal.</p>}
        <div className="flex min-h-[420px] flex-col rounded-xl border border-border">
          <div className="flex-1 space-y-3 overflow-y-auto p-4">
            {thread.length === 0 && (
              <p className="py-8 text-center text-sm text-muted-foreground">
                No messages yet — say hello.
              </p>
            )}
            {thread.map((m) => (
              <div key={m.id} className={m.sender_id === user?.id ? "text-right" : ""}>
                <p className="text-[11px] text-muted-foreground">
                  {new Date(m.created_at).toLocaleString()}
                </p>
                <p
                  className={`mt-0.5 inline-block max-w-[85%] rounded-xl px-3 py-2 text-sm ${m.sender_id === user?.id ? "bg-primary text-primary-foreground" : "bg-muted"}`}
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
              placeholder="Write a message"
              aria-label="Write a message"
              maxLength={2000}
            />
            <Button size="icon" onClick={send} disabled={!draft.trim()} aria-label="Send">
              <Send className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </Sheet>
    </Phone>
  );
}
