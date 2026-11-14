import { Link } from "@tanstack/react-router";
import { CalendarDays } from "lucide-react";
import { useAssignmentNotifications } from "@/hooks/useAssignmentNotifications";

export function CalendarLink({ className }: { className: string }) {
  const { data = [] } = useAssignmentNotifications();
  const overdue = data.filter((note) => note.kind === "overdue").length;
  return (
    <Link
      to="/calendar"
      aria-label={overdue ? `Calendar, ${overdue} overdue` : "Calendar"}
      className={`relative ${className}`}
    >
      <CalendarDays aria-hidden="true" className="h-5 w-5" />
      {overdue > 0 && (
        <span
          aria-hidden="true"
          className="absolute -right-1 -top-1 rounded-full bg-destructive px-1.5 py-0.5 text-[10px] font-bold text-white"
        >
          {overdue > 99 ? "99+" : overdue}
        </span>
      )}
    </Link>
  );
}
