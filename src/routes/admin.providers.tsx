import { createFileRoute } from "@tanstack/react-router";
import { Phone, Header, Sheet, CanvasHeading } from "@/components/AppShell";
import { AdminNav } from "@/components/AdminNav";
import { ExternalProviders } from "@/components/ExternalProviders";
import { pageMeta } from "@/lib/page-meta";
export const Route = createFileRoute("/admin/providers")({
  head: () => pageMeta("Providers — Plusticity", "Manage approved training content providers."),
  component: ProvidersPage,
});
function ProvidersPage() {
  return (
    <Phone>
      <Header />
      <Sheet wide>
        <CanvasHeading eyebrow="Admin" title="Providers" />
        <AdminNav />
        <div className="mt-4 max-w-4xl">
          <ExternalProviders />
        </div>
      </Sheet>
    </Phone>
  );
}
