import { createFileRoute } from "@tanstack/react-router";
import { handleCohortReminders } from "@/lib/cohort-reminders.server";

export const Route = createFileRoute("/api/cron/cohort-reminders")({
  server: { handlers: { POST: ({ request }) => handleCohortReminders(request) } },
});
