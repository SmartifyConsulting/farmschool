import { Link, useRouterState } from "@tanstack/react-router";

const SECTIONS = [
  { to: "/admin/users", label: "Users" },
  { to: "/admin/cohorts", label: "Cohorts" },
  { to: "/admin/programs", label: "Programs" },
  { to: "/admin/grade-moderation", label: "Grade Moderation" },
  { to: "/admin/external-content", label: "Library" },
  { to: "/admin/organizations", label: "Organizations" },
  { to: "/admin/token-ledger", label: "Token Ledger" },
  { to: "/admin/recycle-bin", label: "Recycle Bin" },
] as const;

/** Persistent section nav shown on every admin screen, so switching sections never needs a trip back through the index. */
export function AdminNav() {
  const path = useRouterState({ select: (s) => s.location.pathname });
  return (
    <div
      role="navigation"
      aria-label="Admin sections"
      className="flex gap-4 overflow-x-auto border-b border-border"
    >
      {SECTIONS.map((s) => {
        const active = path === s.to;
        return (
          <Link
            key={s.to}
            to={s.to}
            aria-current={active ? "page" : undefined}
            className={`shrink-0 whitespace-nowrap border-b-2 px-1 pb-3 text-sm font-semibold ${active ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"}`}
          >
            {s.label}
          </Link>
        );
      })}
    </div>
  );
}
