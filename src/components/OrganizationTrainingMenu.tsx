import { Link } from "@tanstack/react-router";
import { Bell, ChartNoAxesCombined, ChevronRight, GraduationCap, Users } from "lucide-react";
import { Button } from "@/components/ui/button";

export type WorkspaceTrainingSection = "home" | "programs" | "cohorts" | "progress";
export function OrganizationTrainingMenu({
  organizationId,
  canManage,
  onSelect,
}: {
  organizationId: string;
  canManage: boolean;
  onSelect: (section: WorkspaceTrainingSection) => void;
}) {
  const rows = [
    {
      id: "programs",
      title: "Programmes",
      description: canManage
        ? "Manage structured learning programmes"
        : "View your assigned learning programmes",
      icon: GraduationCap,
    },
    {
      id: "cohorts",
      title: "Cohorts",
      description: canManage
        ? "Organise learners and training groups"
        : "View your assigned training",
      icon: Users,
    },
    {
      id: "progress",
      title: "Learning progress",
      description: canManage
        ? "Monitor participation and performance"
        : "Track your learning progress",
      icon: ChartNoAxesCombined,
    },
  ] as const;
  const rowClass =
    "flex w-full items-center gap-4 py-5 text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring";
  return (
    <section className="space-y-1" aria-label="Workspace training">
      <div className="flex flex-wrap items-center justify-between gap-3 py-3">
        <h2 className="font-semibold">Training programmes</h2>
        {canManage && (
          <Button size="sm" onClick={() => onSelect("programs")}>
            + New programme
          </Button>
        )}
      </div>
      <div className="divide-y divide-border">
        {rows.map((row) => {
          const content = (
            <>
              <span className="flex size-11 shrink-0 items-center justify-center rounded-lg bg-muted/40">
                <row.icon className="h-5 w-5" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block font-semibold">{row.title}</span>
                <span className="supporting-text block text-muted-foreground">
                  {row.description}
                </span>
              </span>
              <ChevronRight className="h-5 w-5 shrink-0 text-muted-foreground" />
            </>
          );
          return canManage ? (
            <button
              key={row.id}
              type="button"
              className={rowClass}
              onClick={() => onSelect(row.id)}
            >
              {content}
            </button>
          ) : (
            <Link key={row.id} className={rowClass} to="/courses">
              {content}
            </Link>
          );
        })}
        <Link
          className={rowClass}
          to={canManage ? "/organizations/$id/notifications" : "/notifications"}
          params={{ id: organizationId }}
        >
          <span className="flex size-11 shrink-0 items-center justify-center rounded-lg bg-muted/40">
            <Bell className="h-5 w-5" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block font-semibold">Notifications</span>
            <span className="supporting-text block text-muted-foreground">
              {canManage ? "Manage training communications" : "View your learning notifications"}
            </span>
          </span>
          <ChevronRight className="h-5 w-5 shrink-0 text-muted-foreground" />
        </Link>
      </div>
    </section>
  );
}
