import { createFileRoute } from "@tanstack/react-router";
import { ProgramManager } from "@/components/ProgramManager";
import { pageMeta } from "@/lib/page-meta";
export const Route = createFileRoute("/organizations/$id/programs")({
  component: OrganizationPrograms,
  head: () =>
    pageMeta(
      "Organization programs — Plusticity",
      "Manage company-owned learning programs and cohort assignments.",
    ),
});
function OrganizationPrograms() {
  const { id } = Route.useParams();
  return <ProgramManager key={id} organizationId={id} />;
}
