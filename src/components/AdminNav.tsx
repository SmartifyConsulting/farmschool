import { Link, useRouterState } from "@tanstack/react-router";

const SECTIONS = [
  { to: "/admin/users", label: "Users" },
  { to: "/admin/cohorts", label: "Cohorts" },
  { to: "/admin/programs", label: "Programs" },
  { to: "/admin/grade-moderation", label: "Grade Moderation" },
  { to: "/admin/creators", label: "Creator Approvals" },
  { to: "/admin/external-content", label: "Library" },
  { to: "/admin/api-connections", label: "API Connections" },
  { to: "/admin/lti", label: "LTI Platforms" },
  { to: "/admin/token-ledger", label: "Token Ledger" },
] as const;

/** Persistent section nav shown on every admin screen, so switching sections never needs a trip back through the index. */
export function AdminNav() {
  const path = useRouterState({ select: (s) => s.location.pathname });
  return (
    <div
      role="navigation"
      aria-label="Admin sections"
      className="flex flex-wrap gap-2 border-b border-border pb-4"
    >
      {SECTIONS.map((s) => {
        const active = path === s.to;
        return (
          <Link
            key={s.to}
            to={s.to}
            className={`rounded-full px-4 py-2 text-sm font-semibold ${active ? "bg-primary text-primary-foreground" : "border border-border"}`}
          >
            {s.label}
          </Link>
        );
      })}
    </div>
  );
}
