import { Link } from "@tanstack/react-router";
import { Bell } from "lucide-react";
import { useAssignmentNotifications } from "@/hooks/useAssignmentNotifications";

export function NotificationBell({ className }: { className: string }) {
  const { data = [] } = useAssignmentNotifications();
  const unread = data.filter((note) => !note.read).length;
  return (
    <Link
      to="/notifications"
      aria-label={unread ? `Notifications, ${unread} unread` : "Notifications"}
      className={`relative ${className}`}
    >
      <Bell aria-hidden="true" className="h-5 w-5" />
      {unread > 0 && (
        <span
          aria-hidden="true"
          className="absolute -right-1 -top-1 rounded-full bg-destructive px-1.5 py-0.5 text-[10px] font-bold text-white"
        >
          {unread > 99 ? "99+" : unread}
        </span>
      )}
    </Link>
  );
}
