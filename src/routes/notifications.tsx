import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Bell } from "lucide-react";
import { toast } from "sonner";
import { Phone, Header, Sheet, CanvasHeading } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { useAssignmentNotifications } from "@/hooks/useAssignmentNotifications";
import { useAuth } from "@/hooks/useLearning";
import { supabase } from "@/integrations/supabase/client";
import { friendlyError } from "@/lib/friendly-error";
import { pageMeta } from "@/lib/page-meta";

export const Route = createFileRoute("/notifications")({
  head: () =>
    pageMeta("Notifications — Plusticity", "Your course assignments and deadline reminders."),
  component: Notifications,
});

function Notifications() {
  const { user, ready } = useAuth();
  const { data: notes = [], isLoading, error } = useAssignmentNotifications();
  const queryClient = useQueryClient();
  const [busy, setBusy] = useState(false);
  const unread = notes.filter((note) => !note.read);
  const markRead = async (keys: string[]) => {
    if (!user || busy || !keys.length) return;
    setBusy(true);
    try {
      const { error } = await supabase.from("notification_reads").upsert(
        keys.map((notification_key) => ({
          user_id: user.id,
          notification_key,
          read_at: new Date().toISOString(),
        })),
        { onConflict: "user_id,notification_key" },
      );
      if (error) throw error;
      await queryClient.invalidateQueries({ queryKey: ["assignment-notifications", user.id] });
    } catch (error) {
      toast.error(friendlyError(error, "Could not save notification status."));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Phone>
      <Header />
      <Sheet>
        <CanvasHeading title="Notifications" />
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
          <Link to="/messages" className="text-sm font-semibold text-primary">
            Open messages
          </Link>
          <Button
            variant="outline"
            disabled={busy || !unread.length}
            onClick={() => void markRead(unread.map((note) => note.key))}
          >
            Mark all as read
          </Button>
        </div>
        <p className="mt-4 text-xs text-muted-foreground">
          Assignment and deadline reminders update while you use Plusticity. Completed, certified
          courses are removed from this list.
        </p>
        {!ready || (user && isLoading) ? (
          <p className="py-8">Loading notifications…</p>
        ) : !user ? (
          <p className="py-8">
            <Link to="/auth" className="font-semibold text-primary">
              Sign in
            </Link>{" "}
            to see your notifications.
          </p>
        ) : error ? (
          <p role="alert" className="py-8 text-sm text-destructive">
            Could not load notifications. Please try again.
          </p>
        ) : !notes.length ? (
          <p className="py-8 text-sm text-muted-foreground">
            You have no outstanding assignment reminders.
          </p>
        ) : (
          <ul className="mt-4 divide-y divide-border">
            {notes.map((note) => (
              <li
                key={note.key}
                className={`flex flex-wrap items-start gap-3 py-4 ${note.read ? "opacity-70" : ""}`}
              >
                <Bell aria-hidden="true" className="mt-1 h-5 w-5 shrink-0 text-primary" />
                <div className="min-w-0 flex-1">
                  <p
                    className={`text-xs font-semibold ${note.kind === "overdue" ? "text-destructive" : "text-primary"}`}
                  >
                    {note.kind === "overdue"
                      ? "Overdue"
                      : note.kind === "due-soon"
                        ? "Due within seven days"
                        : "Course assigned"}
                    {!note.read ? " · Unread" : ""}
                  </p>
                  <Link
                    to="/class/$id"
                    params={{ id: note.courseId }}
                    className="break-words text-sm font-semibold hover:text-primary"
                  >
                    {note.courseTitle}
                  </Link>
                  <p className="text-xs text-muted-foreground">
                    {note.cohortName}
                    {note.dueAt
                      ? " · Due " +
                        new Date(note.dueAt).toLocaleString("en-ZA", {
                          timeZone: "Africa/Johannesburg",
                        }) +
                        " SAST"
                      : " · No deadline"}
                  </p>
                </div>
                {!note.read && (
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={busy}
                    onClick={() => void markRead([note.key])}
                  >
                    Mark as read
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )}
      </Sheet>
    </Phone>
  );
}
