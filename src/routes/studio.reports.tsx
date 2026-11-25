import { createFileRoute } from "@tanstack/react-router";
import { Phone, Header, Sheet, CanvasHeading } from "@/components/AppShell";
import { AnalyticsReport } from "@/components/reports/AnalyticsReport";
import { ComplianceReport } from "@/components/reports/ComplianceReport";
import { CourseUsageReport } from "@/components/reports/CourseUsageReport";
import { pageMeta } from "@/lib/page-meta";
import { Tabs, TabsContent } from "@/components/ui/tabs";
import { SectionTabsList, SectionTabsTrigger } from "@/components/SectionTabs";

type ReportTab = "analytics" | "compliance" | "course-usage";

export const Route = createFileRoute("/studio/reports")({
  validateSearch: (s: Record<string, unknown>): { tab: ReportTab } => ({
    tab: s["tab"] === "compliance" || s["tab"] === "course-usage" ? s["tab"] : "analytics",
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
            {(["analytics", "compliance", "course-usage"] as const).map((t) => (
              <SectionTabsTrigger key={t} value={t}>
                {t === "analytics"
                  ? "Analytics"
                  : t === "compliance"
                    ? "Compliance"
                    : "Course Usage"}
              </SectionTabsTrigger>
            ))}
          </SectionTabsList>
          <TabsContent value="course-usage">
            <CourseUsageReport />
          </TabsContent>
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
