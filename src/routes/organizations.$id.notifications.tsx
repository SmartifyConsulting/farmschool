import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useLearning";
import { supabase } from "@/integrations/supabase/client";
import { Phone, Header, Sheet, CanvasHeading } from "@/components/AppShell";
import { OrganizationNotificationRules } from "@/components/OrganizationNotificationRules";
import { pageMeta } from "@/lib/page-meta";

export const Route = createFileRoute("/organizations/$id/notifications")({
  component: OrganizationNotificationsPage,
  head: () =>
    pageMeta("Notification rules — Plusticity", "Automatically notify matching people in your organization."),
});

function OrganizationNotificationsPage() {
  const { id } = Route.useParams();
  const { user, ready } = useAuth();
  const access = useQuery({
    queryKey: ["org-notifications-access", id, user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("my_organizations").eq("id", id).maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  return (
    <Phone>
      <Header />
      <Sheet>
        <CanvasHeading eyebrow="Organization" title="Notification rules" />
        {!ready || access.isLoading ? (
          <p className="py-8 text-sm text-muted-foreground">Checking permissions…</p>
        ) : !access.data?.can_manage ? (
          <p className="py-8 text-sm text-muted-foreground">Organization management access required.</p>
        ) : (
          <div className="mt-4">
            <OrganizationNotificationRules key={id} organizationId={id} />
          </div>
        )}
      </Sheet>
    </Phone>
  );
}
