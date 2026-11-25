import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Phone, Header, Sheet, CanvasHeading } from "@/components/AppShell";
import { AdminNav } from "@/components/AdminNav";
import { ContentLibraryContent } from "@/components/ContentLibraryContent";
import { useAuth } from "@/hooks/useLearning";
import { supabase } from "@/integrations/supabase/client";
import { pageMeta } from "@/lib/page-meta";

export const Route = createFileRoute("/admin/external-content")({
  validateSearch: (
    s: Record<string, unknown>,
  ): { tab?: "raw" | "drafts" | "produced" | undefined } => ({
    tab: s["tab"] === "drafts" || s["tab"] === "produced" ? s["tab"] : undefined,
  }),
  component: ExternalContentAdmin,
  head: () =>
    pageMeta("Content Library — Plusticity", "Manage Raw sources and Completed training material."),
});

function ExternalContentAdmin() {
  const { tab } = Route.useSearch();
  const { user, ready } = useAuth();
  const { data: isAdmin, isLoading } = useQuery({
    queryKey: ["admin-home-role", user?.id],
    enabled: !!user,
    queryFn: async () =>
      (await supabase.rpc("has_role", { _user_id: user!.id, _role: "admin" })).data === true,
  });
  return (
    <Phone>
      <Header />
      <Sheet wide>
        <div className="mb-4">
          <CanvasHeading eyebrow="Admin" title="Content Library" />
        </div>
        {!ready || (user && isLoading) ? (
          <p className="py-8 text-sm text-muted-foreground">Checking permissions…</p>
        ) : !user ? (
          <p className="py-8 text-sm">
            <Link to="/auth" className="font-semibold text-primary">
              Sign in
            </Link>{" "}
            to manage the library.
          </p>
        ) : !isAdmin ? (
          <p className="py-8 text-sm text-muted-foreground">
            Only administrators can manage the library.
          </p>
        ) : (
          <div className="space-y-4">
            <AdminNav />
            <ContentLibraryContent scope="admin" initialStage={tab ?? "raw"} />
          </div>
        )}
      </Sheet>
    </Phone>
  );
}
