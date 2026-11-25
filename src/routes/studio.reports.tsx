import { createFileRoute } from "@tanstack/react-router";
import { Phone, Header, Sheet, CanvasHeading } from "@/components/AppShell";
import { AnalyticsReport } from "@/components/reports/AnalyticsReport";
import { ComplianceReport } from "@/components/reports/ComplianceReport";
import { pageMeta } from "@/lib/page-meta";
import { Tabs, TabsContent } from "@/components/ui/tabs";
import { SectionTabsList, SectionTabsTrigger } from "@/components/SectionTabs";

type ReportTab = "analytics" | "compliance";

export const Route = createFileRoute("/studio/reports")({
  validateSearch: (s: Record<string, unknown>): { tab: ReportTab } => ({
    tab: s["tab"] === "compliance" ? "compliance" : "analytics",
  }),
  head: () =>
    pageMeta(
      "Reports — Plusticity",
      "Learner analytics and course completion compliance in one place.",
    ),
  component: Reports,
});

function Reports() {
  const { tab } = Route.useSearch();
  const navigate = Route.useNavigate();
  return (
    <Phone>
      <Header />
      <Sheet>
        <CanvasHeading eyebrow="Course Studio" title="Reports" />
        <Tabs
          value={tab}
          onValueChange={(value) => void navigate({ search: { tab: value as ReportTab } })}
        >
          <SectionTabsList aria-label="Report type" className="mb-5">
            {(["analytics", "compliance"] as const).map((t) => (
              <SectionTabsTrigger key={t} value={t}>
                {t === "analytics" ? "Analytics" : "Compliance"}
              </SectionTabsTrigger>
            ))}
          </SectionTabsList>
          <TabsContent value="analytics">
            <AnalyticsReport />
          </TabsContent>
          <TabsContent value="compliance">
            <ComplianceReport />
          </TabsContent>
        </Tabs>
      </Sheet>
    </Phone>
  );
}
