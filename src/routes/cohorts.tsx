import { createFileRoute } from "@tanstack/react-router";
import { Phone, Header, Sheet, CanvasHeading } from "@/components/AppShell";
import { CohortReportsContent } from "@/components/CohortReports";
import { pageMeta } from "@/lib/page-meta";

export const Route = createFileRoute("/cohorts")({
  component: CohortReports,
  head: () =>
    pageMeta("Cohort reports — Plusticity", "View progress for the learner groups you manage."),
});

function CohortReports() {
  return (
    <Phone>
      <Header />
      <Sheet wide>
        <CanvasHeading eyebrow="For managers" title="Cohort reports" />
        <CohortReportsContent />
      </Sheet>
    </Phone>
  );
}
