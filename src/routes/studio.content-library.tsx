import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import { Phone, Header, Sheet, CanvasHeading } from "@/components/AppShell";
import { ContentLibraryContent } from "@/components/ContentLibraryContent";
export const Route = createFileRoute("/studio/content-library")({
  head: () => ({ meta: [{ title: "Content Library — Plusticity" }] }),
  component: ContentLibraryPage,
});
function ContentLibraryPage() {
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
        <ContentLibraryContent />
      </Sheet>
    </Phone>
  );
}
