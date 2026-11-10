import { createFileRoute } from "@tanstack/react-router";
import { Phone, Header, Sheet, CanvasHeading } from "@/components/AppShell";
import { pageMeta } from "@/lib/page-meta";

export const Route = createFileRoute("/privacy")({
  component: Privacy,
  head: () =>
    pageMeta(
      "Privacy Policy — Plusticity",
      "How Plusticity collects, uses and protects your information.",
    ),
});

function Privacy() {
  return (
    <Phone>
      <Header />
      <Sheet>
        <div className="max-w-3xl space-y-4 pb-10 text-sm text-muted-foreground">
          <CanvasHeading eyebrow="Legal" title="Privacy Policy" />
          <p className="rounded-xl border border-dashed border-border bg-muted/40 p-3 text-xs">
            Placeholder content — have Smartify Consulting's legal counsel review and replace this
            page, and confirm it matches what the platform actually collects and stores, before it
            is relied on as a binding policy.
          </p>
          <p>
            Smartify Consulting (Pty) Ltd ("we", "us") operates Plusticity. This policy describes
            the personal information we collect and how we use it.
          </p>
          <p>
            We collect account information (such as your name, region and role) and information
            about your activity on the platform, including courses viewed, progress and quiz
            results, so that we can provide and improve the service.
          </p>
          <p>
            We do not sell your personal information. We may share information with service
            providers (such as our hosting and database provider) strictly to operate the platform,
            and as required by law.
          </p>
          <p>
            You can request access to, correction of, or deletion of your personal information by
            contacting{" "}
            <a href="mailto:support@mobileschool.co.za" className="font-medium text-primary">
              support@mobileschool.co.za
            </a>
            .
          </p>
          <p>
            This policy may be updated from time to time. We will post any changes on this page.
          </p>
        </div>
      </Sheet>
    </Phone>
  );
}
