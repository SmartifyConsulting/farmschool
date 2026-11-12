import { createFileRoute, Link } from "@tanstack/react-router";
import { Phone, Header, Sheet, CanvasHeading } from "@/components/AppShell";
import { AnalyticsReport } from "@/components/reports/AnalyticsReport";
import { ComplianceReport } from "@/components/reports/ComplianceReport";
import { pageMeta } from "@/lib/page-meta";

type ReportTab = "analytics" | "compliance";

export const Route = createFileRoute("/studio/reports")({
  validateSearch: (s: Record<string, unknown>): { tab: ReportTab } => ({
    tab: s["tab"] === "compliance" ? "compliance" : "analytics",
  }),
  head: () =>
    pageMeta("Reports — Plusticity", "Learner analytics and course completion compliance in one place."),
  component: Reports,
});

function Reports() {
  const { tab } = Route.useSearch();
  return (
    <Phone>
      <Header />
      <Sheet>
        <CanvasHeading eyebrow="Course Studio" title="Reports" />
        <div role="tablist" aria-label="Report type" className="mb-5 flex gap-2 border-b border-border pb-4">
          {(["analytics", "compliance"] as const).map((t) => (
            <Link
              key={t}
              to="/studio/reports"
              search={{ tab: t }}
              role="tab"
              aria-selected={tab === t}
              className={`rounded-full px-4 py-2 text-sm font-semibold ${tab === t ? "bg-primary text-primary-foreground" : "border border-border"}`}
            >
              {t === "analytics" ? "Analytics" : "Compliance"}
            </Link>
          ))}
        </div>
        {tab === "analytics" ? <AnalyticsReport /> : <ComplianceReport />}
      </Sheet>
    </Phone>
  );
}
