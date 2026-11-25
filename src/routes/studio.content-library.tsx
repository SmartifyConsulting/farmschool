import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import { Phone, Header, Sheet, CanvasHeading } from "@/components/AppShell";
import { ContentLibraryContent } from "@/components/ContentLibraryContent";
export const Route = createFileRoute("/studio/content-library")({
  validateSearch: (
    s: Record<string, unknown>,
  ): { tab?: "raw" | "drafts" | "produced" | undefined } => ({
    tab: s["tab"] === "drafts" || s["tab"] === "produced" ? s["tab"] : undefined,
  }),
  head: () => ({ meta: [{ title: "Content Library — Plusticity" }] }),
  component: ContentLibraryPage,
});
function ContentLibraryPage() {
  const { tab } = Route.useSearch();
  return (
    <Phone>
      <Header />
      <Sheet wide>
        <div className="mb-4 flex items-center gap-2">
          <Link
            to="/studio"
            className="text-muted-foreground hover:text-foreground"
            aria-label="Back to Course Studio"
          >
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <CanvasHeading eyebrow="For trainers" title="Content Library" />
        </div>
        <ContentLibraryContent initialStage={tab ?? "raw"} />
      </Sheet>
    </Phone>
  );
}
