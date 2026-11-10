import { createFileRoute } from "@tanstack/react-router";
import { Phone, Header, Sheet, CanvasHeading } from "@/components/AppShell";
import { pageMeta } from "@/lib/page-meta";

export const Route = createFileRoute("/terms")({
  component: Terms,
  head: () =>
    pageMeta(
      "Terms and Conditions — Plusticity",
      "Terms and conditions for using Plusticity.",
    ),
});

function Terms() {
  return (
    <Phone>
      <Header />
      <Sheet>
        <div className="max-w-3xl space-y-4 pb-10 text-sm text-muted-foreground">
          <CanvasHeading eyebrow="Legal" title="Terms and Conditions" />
          <p className="rounded-xl border border-dashed border-border bg-muted/40 p-3 text-xs">
            Placeholder content — have Smartify Consulting's legal counsel review and replace this
            page before it is relied on as a binding agreement.
          </p>
          <p>
            These Terms and Conditions govern your use of Plusticity, operated by Smartify
            Consulting (Pty) Ltd ("we", "us"). By creating an account or using the platform, you
            agree to these terms.
          </p>
          <p>
            Plusticity provides access to training courses created by independent trainers and
            course creators. We do not guarantee the accuracy, completeness or outcome of any course
            content, and course creators are responsible for the material they publish.
          </p>
          <p>
            You are responsible for keeping your account credentials secure and for all activity
            under your account. Content you upload or create must not infringe on the rights of
            others.
          </p>
          <p>
            We may suspend or terminate access for conduct that violates these terms. These terms
            may be updated from time to time; continued use after a change constitutes acceptance of
            the updated terms.
          </p>
          <p>
            For questions about these terms, contact{" "}
            <a href="mailto:support@mobileschool.co.za" className="font-medium text-primary">
              support@mobileschool.co.za
            </a>
            .
          </p>
        </div>
      </Sheet>
    </Phone>
  );
}
