import { z } from "zod";

export const reminderJobs = z
  .array(
    z.object({
      id: z.string().uuid(),
      lease: z.string().uuid(),
      payload: z.object({
        recipient: z.string().email(),
        courseId: z.string().uuid(),
        courseTitle: z.string(),
        cohortName: z.string(),
        kind: z.enum(["assigned", "due-soon", "overdue"]),
        dueAt: z.string().nullable(),
      }),
    }),
  )
  .max(50);
export type ReminderJob = z.infer<typeof reminderJobs>[number];

export function validateReminderConfiguration(from: string, origin: string) {
  const url = new URL(origin);
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    url.pathname !== "/"
  )
    throw new Error("A secure application origin is required");
  if (!from.trim() || /[\r\n]/.test(from) || from.length > 200)
    throw new Error("A verified email sender is required");
  return url;
}

export function reminderMessage(job: ReminderJob, from: string, origin: string) {
  const url = validateReminderConfiguration(from, origin);
  const subject = {
    assigned: "A course has been assigned to you",
    "due-soon": "Your assigned course is due soon",
    overdue: "Your assigned course is overdue",
  }[job.payload.kind];
  const clean = (value: string) => value.replace(/\s+/g, " ").trim().slice(0, 200);
  const due = job.payload.dueAt
    ? new Date(job.payload.dueAt).toLocaleString("en-ZA", {
        timeZone: "Africa/Johannesburg",
        year: "numeric",
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      }) + " SAST"
    : "No deadline";
  return {
    from: from.trim(),
    to: [job.payload.recipient],
    subject: "Plusticity: " + subject,
    text: [
      subject + ".",
      "",
      "Course: " + clean(job.payload.courseTitle),
      "Group: " + clean(job.payload.cohortName),
      "Deadline: " + due,
      "",
      "Open the course: " + new URL("/class/" + job.payload.courseId, url).href,
      "Payment and course prerequisites still apply.",
      "",
      "Manage assignment email reminders: " + new URL("/courses", url).href,
    ].join("\n"),
  };
}
