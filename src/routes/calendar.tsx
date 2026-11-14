import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { CalendarDays } from "lucide-react";
import { Phone, Header, Sheet, CanvasHeading } from "@/components/AppShell";
import { Calendar } from "@/components/ui/calendar";
import { useAssignmentNotifications } from "@/hooks/useAssignmentNotifications";
import { useAuth } from "@/hooks/useLearning";
import { pageMeta } from "@/lib/page-meta";

export const Route = createFileRoute("/calendar")({
  head: () => pageMeta("Calendar — Plusticity", "Your upcoming and overdue course deadlines."),
  component: LearnerCalendar,
});

function dayKey(iso: string) {
  return iso.slice(0, 10);
}

function LearnerCalendar() {
  const { user, ready } = useAuth();
  const { data: notes = [], isLoading, error } = useAssignmentNotifications();
  const [selected, setSelected] = useState<Date | undefined>(undefined);

  const dated = useMemo(() => notes.filter((note) => note.dueAt), [notes]);
  const deadlineDays = useMemo(
    () => dated.map((note) => new Date(note.dueAt as string)),
    [dated],
  );
  const overdueDays = useMemo(
    () => dated.filter((note) => note.kind === "overdue").map((note) => new Date(note.dueAt as string)),
    [dated],
  );

  const visible = useMemo(() => {
    if (!selected) return dated;
    const key = dayKey(selected.toISOString());
    return dated.filter((note) => dayKey(note.dueAt as string) === key);
  }, [dated, selected]);

  return (
    <Phone>
      <Header />
      <Sheet>
        <CanvasHeading title="Calendar" />
        <p className="mt-4 text-xs text-muted-foreground">
          Due dates for every course assigned to you through your cohorts. Dates with a deadline
          are marked; red dates are already overdue.
        </p>
        {!ready || (user && isLoading) ? (
          <p className="py-8">Loading your calendar…</p>
        ) : !user ? (
          <p className="py-8">
            <Link to="/auth" className="font-semibold text-primary">
              Sign in
            </Link>{" "}
            to see your deadlines.
          </p>
        ) : error ? (
          <p role="alert" className="py-8 text-sm text-destructive">
            Could not load your calendar. Please try again.
          </p>
        ) : (
          <>
            <div className="mt-4 flex justify-center">
              <Calendar
                mode="single"
                selected={selected}
                onSelect={setSelected}
                modifiers={{ deadline: deadlineDays, overdue: overdueDays }}
                modifiersClassNames={{
                  deadline: "font-bold underline",
                  overdue: "bg-destructive/15 text-destructive font-bold",
                }}
                className="rounded-md border"
              />
            </div>
            {selected && (
              <button
                type="button"
                className="mt-2 text-xs font-semibold text-primary"
                onClick={() => setSelected(undefined)}
              >
                Show all upcoming deadlines
              </button>
            )}
            {!visible.length ? (
              <p className="py-8 text-sm text-muted-foreground">
                {selected ? "No deadlines on this day." : "You have no outstanding deadlines."}
              </p>
            ) : (
              <ul className="mt-4 divide-y divide-border">
                {visible.map((note) => (
                  <li key={note.key} className="flex items-start gap-3 py-4">
                    <CalendarDays
                      aria-hidden="true"
                      className={`mt-1 h-5 w-5 shrink-0 ${
                        note.kind === "overdue" ? "text-destructive" : "text-primary"
                      }`}
                    />
                    <div className="min-w-0 flex-1">
                      <p
                        className={`text-xs font-semibold ${
                          note.kind === "overdue" ? "text-destructive" : "text-primary"
                        }`}
                      >
                        {note.kind === "overdue" ? "Overdue" : "Upcoming"}
                      </p>
                      <Link
                        to="/class/$id"
                        params={{ id: note.courseId }}
                        className="break-words text-sm font-semibold hover:text-primary"
                      >
                        {note.courseTitle}
                      </Link>
                      <p className="text-xs text-muted-foreground">
                        {note.cohortName} · Due{" "}
                        {new Date(note.dueAt as string).toLocaleString("en-ZA", {
                          timeZone: "Africa/Johannesburg",
                        })}{" "}
                        SAST
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </Sheet>
    </Phone>
  );
}
