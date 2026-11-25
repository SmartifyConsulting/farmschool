import { createFileRoute, Link } from "@tanstack/react-router";
import { Phone, Header, Sheet, CanvasHeading } from "@/components/AppShell";
import { MySkills } from "@/components/MySkills";
import { pageMeta } from "@/lib/page-meta";
export const Route = createFileRoute("/skills")({
  component: Skills,
  head: () =>
    pageMeta("My skills — Plusticity", "View your trainer-assessed competencies and feedback."),
});
function Skills() {
  return (
    <Phone>
      <Header />
      <Sheet>
        <CanvasHeading title="My skills" />
        <Link to="/courses" className="mt-3 inline-block text-sm font-semibold text-primary">
          Back to My Learning
        </Link>
        <MySkills />
      </Sheet>
    </Phone>
  );
}
