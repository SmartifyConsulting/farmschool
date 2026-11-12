import { createFileRoute, Link, Outlet, useRouterState } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { MessageCircle } from "lucide-react";
import { Phone, Header, Sheet, CanvasHeading } from "@/components/AppShell";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useLearning";
import { pageMeta } from "@/lib/page-meta";
import { portalSearch } from "@/lib/customer-portal";

export const Route = createFileRoute("/messages")({
  validateSearch: portalSearch,
  head: () => pageMeta("Messages — Plusticity", "Message people from your course communities."),
  component: MessagesLayout,
});

type Thread = {
  partner_id: string;
  partner_name: string | null;
  last_message: string;
  last_at: string;
  unread: boolean;
};

function MessagesLayout() {
  const path = useRouterState({ select: (s) => s.location.pathname });
  return path === "/messages" || path === "/messages/" ? <Inbox /> : <Outlet />;
}

function Inbox() {
  const { portal } = Route.useSearch();
  const { user, ready } = useAuth();
  const { data: threads = [] } = useQuery({
    queryKey: ["dm-threads", user?.id],
    enabled: !!user,
    refetchInterval: 30000,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: true,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("dm_threads");
      if (error) throw error;
      return (data ?? []) as Thread[];
    },
  });

  if (ready && !user)
    return (
      <Phone>
        <Header />
        <Sheet>
          <CanvasHeading title="Messages" />
          <p className="py-10 text-center text-sm text-muted-foreground">
            <Link to="/auth" search={portal ? { portal } : {}} className="font-semibold text-primary">
              Sign in
            </Link>{" "}
            to see your messages.
          </p>
        </Sheet>
      </Phone>
    );

  return (
    <Phone>
      <Header />
      <Sheet>
        <CanvasHeading title="Messages" />
        {portal && <p className="text-sm text-muted-foreground">Personal messages across your learner account. Conversations are not restricted to this organization's portal.</p>}
        <ul className="mt-4 space-y-2">
          {threads.map((t) => (
            <li key={t.partner_id}>
              <Link
                to="/messages/$partnerId"
                params={{ partnerId: t.partner_id }}
                search={portal ? { portal } : {}}
                className="flex items-center gap-3 rounded-xl border border-border p-3 hover:bg-muted/50"
              >
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-muted">
                  <MessageCircle className="h-4 w-4 text-primary" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-2">
                    <span className="truncate text-sm font-semibold">
                      {t.partner_name || "Learner"}
                    </span>
                    {t.unread && <span className="h-2 w-2 shrink-0 rounded-full bg-primary" />}
                  </span>
                  <span className="block truncate text-xs text-muted-foreground">
                    {t.last_message}
                  </span>
                </span>
                <span className="shrink-0 text-[11px] text-muted-foreground">
                  {new Date(t.last_at).toLocaleDateString()}
                </span>
              </Link>
            </li>
          ))}
        </ul>
        {threads.length === 0 && (
          <p className="py-10 text-center text-sm text-muted-foreground">
            No conversations yet. Join a course community to message other learners.
          </p>
        )}
      </Sheet>
    </Phone>
  );
}
