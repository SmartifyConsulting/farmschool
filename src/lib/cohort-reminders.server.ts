import { z } from "zod";
import { authenticateCronRequest } from "@/integrations/supabase/cron-auth";
import {
  reminderJobs,
  reminderMessage,
  validateReminderConfiguration,
} from "@/lib/cohort-reminder-message";

export async function handleCohortReminders(request: Request) {
  const denied = await authenticateCronRequest(request);
  if (denied) return denied;
  if (process.env["COHORT_REMINDER_EMAIL_ENABLED"] !== "true")
    return Response.json({ enabled: false, sent: 0 }, { status: 202 });
  const apiKey = process.env["RESEND_API_KEY"];
  const from = process.env["RESEND_FROM"];
  const origin = process.env["APP_BASE_URL"];
  if (!apiKey || !from || !origin)
    return Response.json({ error: "Email delivery is not configured" }, { status: 503 });
  try {
    validateReminderConfiguration(from, origin);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const queued = await supabaseAdmin.rpc("enqueue_cohort_reminders", {});
    if (queued.error) throw new Error("Queue unavailable");
    const claimed = await supabaseAdmin.rpc("claim_cohort_reminders", { _limit: 10 });
    if (claimed.error) throw new Error("Queue unavailable");
    const jobs = reminderJobs.parse(claimed.data);
    let sent = 0;
    let failed = 0;
    let cancelled = 0;
    for (const [index, job] of jobs.entries()) {
      const message = reminderMessage(job, from, origin);
      if (index > 0) await new Promise((resolve) => setTimeout(resolve, 600));
      const permitted = await supabaseAdmin.rpc("authorize_cohort_reminder", {
        _id: job.id,
        _lease: job.lease,
      });
      if (permitted.error) throw new Error("Queue unavailable");
      if (permitted.data !== true) {
        cancelled++;
        continue;
      }
      let providerId: string | null = null;
      let errorCode: string | null = null;
      try {
        const response = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: {
            Authorization: "Bearer " + apiKey,
            "Content-Type": "application/json",
            "Idempotency-Key": "cohort-reminder/" + job.id,
          },
          body: JSON.stringify(message),
          signal: AbortSignal.timeout(20000),
        });
        if (!response.ok) errorCode = "provider_http_" + response.status;
        else {
          const result = z
            .object({ id: z.string().min(1).max(200) })
            .safeParse(await response.json());
          if (result.success) providerId = result.data.id;
          else errorCode = "provider_unconfirmed";
        }
      } catch {
        errorCode = "provider_unconfirmed";
      }
      const recorded = await supabaseAdmin.rpc("finish_cohort_reminder", {
        _id: job.id,
        _lease: job.lease,
        _provider_id: providerId,
        _error: errorCode,
      });
      if (recorded.error) throw new Error("Queue confirmation unavailable");
      if (errorCode) failed++;
      else sent++;
    }
    return Response.json({ enabled: true, queued: queued.data, sent, failed, cancelled });
  } catch {
    return Response.json(
      { error: "Reminder delivery did not finish; queued records will be retried" },
      { status: 503 },
    );
  }
}
