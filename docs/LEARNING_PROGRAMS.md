# Learning programs

Administrators build programs in Administration > Programs. Each stage lists
published courses and a required number of current verified course certificates.
This supports mandatory stages and alternatives such as completing one of three
specialties. A course can appear only once; a program supports up to 30 stages
and 200 courses. Later-stage links appear after earlier requirements are met.
This is a guided program order; it does not prevent taking an independently
available course directly. Course prerequisites remain the access control.

Saving changes the owner's private draft. Publishing creates an immutable
program version. Cohort assignments pin that version, including its course set
and thresholds. Course content can continue through its own revision process;
program versions do not pin individual course curriculum versions. Publishing
again with unchanged content reuses the existing version.

Program assignment applies to current and future cohort members. It does not
buy courses or create course licences. Paid access and individual prerequisites
remain independent. Administrators may set an advisory due date, end or restore
an assignment. Program reminder delivery is not yet part of the email worker.

My Learning lists assigned programs and historical program completion records.
The server records completion only when a currently assigned learner holds
enough current, verified certificates for every stage. For elective stages it
selects the first sufficient set in the published course order. Awards retain
the course certificate IDs, latest renewal IDs and expiry snapshots. Identical
evidence retries return the original award. Refreshed evidence can produce a new
completion record. The award's expiry is the earliest expiry among its selected
certificates; revocation and current requirements are checked live in reports.
Historical awards remain available after cohort membership or assignment ends.
Program awards are distinct from course certificates and do not yet have public
verification or a dedicated printable certificate template.

Administrators and scoped cohort reporting managers can view program progress
and export the full roster as CSV. Page views show 50 learners. CSV exports read
all pages but are not a single transactional snapshot under concurrent changes.

Migration 0062 is applied. Rollback-only role checks passed for version pinning,
publish/award retries, staged progress, elective completion, evidence snapshots,
expired requirements, assignment termination, retained history, outsider denial,
unrelated-cohort RLS and private function/write grants. The application suite
passes 245 tests with 17 environment-gated skips; TypeScript and production build
passed. Browser journeys and independent concurrency/load testing remain pending.
