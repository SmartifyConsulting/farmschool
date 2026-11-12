# Scheduled company progress reports

Current organization managers can generate a durable course-progress snapshot on
demand or enable an hourly-to-30-day interval for a bound company cohort. The
company owns the schedule: a creator's demotion removes access without stranding
the schedule or blocking other current company managers.

Reports record learner names, course titles, deadlines, lesson counts, current
certificate status and payment access separately. A certificate that later
expires does not rewrite a historical report. Newly unpublished or incompatible
private course details are redacted in new snapshots. Historical reports remain
historical records available only to current managers of the original company.

The interface downloads complete snapshots as spreadsheet-safe CSV. It rejects
truncated or duplicated rows rather than exporting a misleading partial report.
Schedules have optimistic version checks; manual capture requests are idempotent
while the snapshot is retained. No email, arbitrary recipient, public link, real
payment or external provider request is involved. Resend activation stays deferred.

At most 30 snapshots per cohort are retained and they become inaccessible after
30 days. The worker deletes expired storage. Each report is limited to 10,000
learner/course rows, failing rather than truncating. A named database job checks
at minutes 7, 22, 37 and 52, processes at most 10 due schedules per check and has
a 45-second statement timeout. Larger queues may delay generation. Schedules
default to paused; current settings and sanitized scheduler status are visible.

Private snapshot storage and report-building functions are unavailable to browser
roles. Manager RPCs check current tenant authority; ordinary learners, other
tenants and demoted creators cannot read report history or schedule data. Each
capture locks its company/cohort and uses an advisory lock against duplicate work.
Failed scheduled generation is isolated and records a sanitized status.

Migration 0071 and transactional SQL checks cover manual retry, complete private
course data, due/duplicate scheduling, stale version rejection, cross-company and
learner denial, creator demotion, unpublished-course redaction and retention.
Browser downloads and the report timer still need observation after deployment.
