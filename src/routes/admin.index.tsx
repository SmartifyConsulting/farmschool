import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useLearning";
import { supabase } from "@/integrations/supabase/client";
import { Phone, Header, Sheet } from "@/components/AppShell";
import { pageMeta } from "@/lib/page-meta";

export const Route = createFileRoute("/admin/")({
  component: AdminHome,
  head: () => pageMeta("Administration — Mobile School", "Manage course creators and learning platform connections."),
});

function AdminHome() {
  const { user, ready } = useAuth();
  const { data: isAdmin, isLoading } = useQuery({
    queryKey: ["admin-home-role", user?.id], enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("has_role", { _user_id: user!.id, _role: "admin" });
      if (error) throw error;
      return data === true;
    },
  });
  return <Phone>
    <Header greeting="Platform management" title="Administration" />
    <Sheet>
      {!ready || (user && isLoading) ? <p className="py-8 text-sm text-muted-foreground">Checking permissions…</p>
      : !user ? <p className="py-8 text-sm"><Link to="/auth" className="font-semibold text-primary">Sign in</Link> to access administration.</p>
      : !isAdmin ? <p className="py-8 text-sm text-muted-foreground">Administrator access required.</p>
      : <div className="max-w-3xl space-y-4 pb-10">
          <p className="text-sm text-muted-foreground">Manage course creators and learning platform connections.</p>
          <div role="navigation" aria-label="Administration sections" className="flex flex-wrap gap-2 border-b border-border pb-4">
            <Link to="/admin/creators" className="rounded-full bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground">Creator Approvals</Link>
            <Link to="/admin/moodle" className="rounded-full border border-border px-4 py-2 text-sm font-semibold">Moodle Settings</Link>
          </div>
          <p className="text-xs text-muted-foreground">Creator approvals are required before new courses can be published. Moodle connection settings are optional.</p>
        </div>}
    </Sheet>
  </Phone>;
}
