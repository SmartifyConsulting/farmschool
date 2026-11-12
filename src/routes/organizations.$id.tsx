import { createFileRoute } from "@tanstack/react-router";
import { OrganizationWorkspace } from "@/components/OrganizationWorkspace";
import { pageMeta } from "@/lib/page-meta";
export const Route = createFileRoute("/organizations/$id")({
  component: Workspace,
  head: () =>
    pageMeta("Organization workspace — Plusticity", "Your organisation's learning workspace."),
});
function Workspace() {
  const { id } = Route.useParams();
  return <OrganizationWorkspace key={id} organizationId={id} />;
}
