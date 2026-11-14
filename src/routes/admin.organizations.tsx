import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useLearning";
import { supabase } from "@/integrations/supabase/client";
import { Phone, Header, Sheet, CanvasHeading, useIsAdmin } from "@/components/AppShell";
import { AdminNav } from "@/components/AdminNav";
import { friendlyError } from "@/lib/friendly-error";
import { pageMeta } from "@/lib/page-meta";

export const Route = createFileRoute("/admin/organizations")({
  component: AdminOrganizations,
  head: () =>
    pageMeta("Organizations — Plusticity", "Link organizations into a parent/child reporting hierarchy."),
});

type Org = { id: string; name: string; parent_id: string | null };

function AdminOrganizations() {
  const { user, ready } = useAuth();
  const admin = useIsAdmin();
  const qc = useQueryClient();

  const { data: orgs = [], isLoading, error } = useQuery({
    queryKey: ["admin-organizations"],
    enabled: admin,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("admin_list_organizations");
      if (error) throw error;
      return (data ?? []) as Org[];
    },
  });

  const setParent = async (orgId: string, parentId: string) => {
    try {
      const { error } = await supabase.rpc("admin_set_organization_parent", {
        _organization: orgId,
        _parent: parentId || null,
      });
      if (error) throw error;
      toast.success("Updated.");
      qc.invalidateQueries({ queryKey: ["admin-organizations"] });
    } catch (error) {
      toast.error(friendlyError(error, "Could not update this organization's parent."));
    }
  };

  return (
    <Phone>
      <Header />
      <Sheet>
        <div className="mx-auto max-w-4xl space-y-4 pb-10">
          <CanvasHeading eyebrow="Admin" title="Organizations" />
          {!ready ? (
            <p className="text-sm text-muted-foreground">Checking permissions…</p>
          ) : !user ? (
            <p className="text-sm">
              <Link to="/auth" className="font-semibold text-primary">
                Sign in
              </Link>{" "}
              as an administrator.
            </p>
          ) : !admin ? (
            <p className="text-sm text-muted-foreground">Administrator access required.</p>
          ) : (
            <>
              <AdminNav />
              <p className="text-sm text-muted-foreground">
                Set a parent organization to give that parent's managers read-only visibility into this
                org's cohort and progress reports. It grants no management rights in the child org, and
                takes effect only for the link you create here.
              </p>
              {isLoading && <p className="text-sm text-muted-foreground">Loading…</p>}
              {error && (
                <p role="alert" className="text-sm text-destructive">
                  {friendlyError(error, "Could not load organizations.")}
                </p>
              )}
              <div className="space-y-2">
                {orgs.map((o) => (
                  <div key={o.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border p-3">
                    <span className="font-semibold">{o.name}</span>
                    <label className="flex items-center gap-2 text-sm">
                      Parent org
                      <select
                        className="rounded-md border bg-background p-1.5"
                        value={o.parent_id ?? ""}
                        onChange={(e) => setParent(o.id, e.target.value)}
                      >
                        <option value="">None</option>
                        {orgs
                          .filter((candidate) => candidate.id !== o.id)
                          .map((candidate) => (
                            <option key={candidate.id} value={candidate.id}>
                              {candidate.name}
                            </option>
                          ))}
                      </select>
                    </label>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </Sheet>
    </Phone>
  );
}
