import { createFileRoute, Outlet, useRouterState } from "@tanstack/react-router";
import { OrganizationWorkspace } from "@/components/OrganizationWorkspace";
import { pageMeta } from "@/lib/page-meta";
export const Route = createFileRoute("/organizations/$id")({
  component: Workspace,
  head: () =>
    pageMeta("Organization workspace — Plusticity", "Your organisation's learning workspace."),
});
function Workspace() {
  const { id } = Route.useParams();
  const path = useRouterState({ select: (s) => s.location.pathname });
  return path.replace(/\/$/, "") === "/organizations/" + id ? (
    <OrganizationWorkspace key={id} organizationId={id} />
  ) : (
    <Outlet />
  );
}
