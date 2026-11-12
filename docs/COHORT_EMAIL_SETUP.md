# Activate scheduled cohort email reminders

The application includes a Resend worker, a private delivery queue, learner
email preferences and cohort-level enable/disable controls. Delivery defaults
to **disabled**. No real email was sent during implementation or testing.

When ready, add these server secrets in the deployment environment:

| Name | Value |
| --- | --- |
| `RESEND_API_KEY` | A Resend key authorised for the verified sending domain. |
| `RESEND_FROM` | The verified sender, such as `Plusticity <learning@your-domain>`. |
| `APP_BASE_URL` | The published HTTPS application origin, without a path or credentials. |
| `LOVABLE_CRON_SECRET` | A private unpredictable secret used only by the scheduler. |
| `COHORT_REMINDER_EMAIL_ENABLED` | Keep `false` until the sender and scheduler are tested; set `true` to activate. |

Configure the hosting scheduler to POST to
`/api/cron/cohort-reminders` every five minutes with the header
`Authorization: Bearer <LOVABLE_CRON_SECRET>`. Keep the secret out of browser
code, URLs and Git. Secret rotation also supports `LOVABLE_CRON_SECRET_PREVIOUS`.
The code does not create a hosting schedule automatically.

Enable scheduled reminders for a cohort in Administration > Cohorts. Learners
can opt out under My Learning > Email reminder preferences. Initial testing
should use a dedicated test cohort and recipient you control.

The worker handles at most ten messages per request. It waits between requests,
uses a stable idempotency key per message, leases work for fifteen minutes,
rechecks eligibility before sending, and retries uncertain provider results with
the same payload. Retries stop after eight attempts or a 23-hour safety window.
This stays within [Resend's documented 24-hour idempotency window](https://resend.com/docs/dashboard/emails/idempotency-keys).
The [send-email API](https://resend.com/docs/api-reference/emails/send-email)
acknowledgement is recorded; it does not establish inbox delivery. Bounce and
delivery-event webhooks remain future work.

Assignment, due-within-seven-days and overdue stages each get at most one queued
message per assignment/effective deadline. Changed deadlines, removed
membership, unpublished courses, changed recipient addresses, completed courses
and opt-outs cancel obsolete pending work. A message already in flight at the
provider may still arrive after a concurrent change. User opt-out does not
remove in-app reminders.

Until Resend configuration and a hosting schedule exist, the worker is prepared
but scheduled delivery is not active. Browser verification and a real-provider
test with a controlled recipient are required before production activation.
