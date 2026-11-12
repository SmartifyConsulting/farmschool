import { createFileRoute, Link, Outlet, useNavigate, useRouterState } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { Phone, Header, Sheet, CanvasHeading, useIsAdmin } from "@/components/AppShell";
import { useAuth } from "@/hooks/useLearning";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { readAllPages } from "@/lib/database-pages";
import { friendlyError } from "@/lib/friendly-error";
import { pageMeta } from "@/lib/page-meta";

export const Route = createFileRoute("/organizations")({
  component: OrganizationsLayout,
  head: () =>
    pageMeta("Organizations — Plusticity", "Your organisation workspaces and learning teams."),
});
function OrganizationsLayout() {
  const path = useRouterState({ select: (s) => s.location.pathname });
  return path === "/organizations" || path === "/organizations/" ? <Organizations /> : <Outlet />;
}
function Organizations() {
  const { user, ready } = useAuth();
  const isAdmin = useIsAdmin();
  const navigate = useNavigate();
  const [id] = useState<string>(() => crypto.randomUUID());
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const list = useQuery({
    queryKey: ["my-organizations", user?.id],
    enabled: !!user,
    refetchInterval: 30000,
    queryFn: async () =>
      (
        await readAllPages(
          supabase.rpc("my_organizations", {}, { count: "exact" }).order("name").order("id"),
        )
      ).data,
  });
  const create = async () => {
    if (busy || name.trim().length < 2) return;
    setBusy(true);
    try {
      const { error } = await supabase.rpc("save_organization", {
        _organization: id,
        _name: name.trim(),
        _welcome: "",
        _color: "#2765BC",
        _logo: null,
        _expected: 0,
      });
      if (error) throw error;
      navigate({ to: "/organizations/$id", params: { id } });
    } catch (error) {
      toast.error(friendlyError(error));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Phone>
      <Header />
      <Sheet>
        <CanvasHeading title="My organizations" />
        {!ready ? (
          <p>Checking sign-in…</p>
        ) : !user ? (
          <Link to="/auth">Sign in to your workspace</Link>
        ) : (
          <div className="space-y-5">
            {list.isPending ? (
              <p>Loading workspaces…</p>
            ) : list.isError ? (
              <p role="alert">Could not load organizations.</p>
            ) : list.data.length ? (
              list.data.map((o) => (
                <article
                  className="space-y-2 rounded-xl border-t-4 p-4 shadow-sm"
                  key={o.id}
                  style={{ borderTopColor: o.brand_color }}
                >
                  <Link
                    className="font-semibold text-primary underline"
                    to="/organizations/$id"
                    params={{ id: o.id }}
                  >
                    {o.name}
                  </Link>
                  <p className="text-sm">
                    {o.can_manage ? "Workspace manager" : "Workspace member"}
                  </p>
                </article>
              ))
            ) : (
              <p>
                You have no organization workspace yet. Ask your administrator to add your
                registered account.
              </p>
            )}
            {isAdmin && (
              <section className="space-y-3 rounded-xl border p-4">
                <h2 className="font-semibold">Create organization</h2>
                <label className="block text-sm">
                  Organization name
                  <Input
                    value={name}
                    maxLength={200}
                    onChange={(e) => setName(e.target.value)}
                    disabled={busy}
                  />
                </label>
                <Button onClick={create} disabled={busy || name.trim().length < 2}>
                  Create workspace
                </Button>
              </section>
            )}
          </div>
        )}
      </Sheet>
    </Phone>
  );
}
