# Dynamic cohort assignment

Company managers can save one paused membership rule per bound cohort, matching
company-managed department/subdepartments, literal job-title substring and
workspace role. Blank department/job filters match the selected role throughout
that company. These are company roles, not self-edited learner profile labels.

The manager previews counts and up to 20 people before applying a run or enabling
future scheduling. Version checks and a matching-roster hash reject stale manual
previews; successful manual request IDs can be retried without duplicate changes.
Saving settings pauses an existing schedule. Managers can pause it separately.

Only rule-added members can be removed by synchronization. Manual adds adopt an
existing rule member. Manual removals create durable exclusions, which managers
can explicitly clear. Capacity failures roll back the entire membership run.
Membership does not allocate paid licences or release permanent named seats.

Private run history records actual added/removed learner IDs, counts, version,
actor and execution mode. Current company managers can export those recorded
changes. Other tenants and ordinary learners cannot read rules, previews or runs.
Private transaction markers distinguish automatic writes from manual roster
edits; authenticated callers cannot forge those markers or call the worker.

Migration 0070 installs one named pg_cron SQL job every 15 minutes, processing at
most 20 due enabled rules with a 45-second statement timeout. Each rule has its
own 15-minute to seven-day interval. Larger queues can run later than requested;
this is not a hard real-time service. Advisory locks prevent overlapping execution
of the same rule. Failures are isolated per rule and sanitized in manager views.
Managers see scheduler availability, heartbeat and the latest job status without
receiving SQL commands or errors. No email or external requests are involved.

Verification: migrations 0069–0070 were tested inside rolled-back transactions,
installed, and their SQL checks passed again. Synthetic fixtures cover manual
ownership/exclusions, descendants, stale previews, capacity atomicity, retry,
scheduled due execution and cross-tenant denial. Type checking, production build
and 266 unit tests passed (17 environment-gated tests skipped). Initial timer
execution and browser interaction have not yet been verified.
