import { createFileRoute } from "@tanstack/react-router";
import { ProgramManager } from "@/components/ProgramManager";
import { pageMeta } from "@/lib/page-meta";
export const Route = createFileRoute("/admin/programs")({
  component: ProgramsAdmin,
  head: () =>
    pageMeta("Programs — Plusticity", "Build versioned learning programs and assign cohorts."),
});
function ProgramsAdmin() {
  return <ProgramManager />;
}
