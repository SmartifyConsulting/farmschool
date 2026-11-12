# Certificate verification and renewal

Course owners set certificate validity and the renewal window in the course
gradebook. A blank validity period means no expiry. Changes require a recorded
reason and apply to new awards and newly started renewal cycles; original awards
retain their dates, course version and validity snapshot. Existing certificates
are not retrospectively expired.

Learners open a certificate in My Learning to enable a public verification link.
Sharing is off by default and explicitly reveals the saved profile name, course
title, original award date/version, latest renewal date and current status.
Emails, account identifiers, payment information and revocation reasons remain
private. Disabling sharing invalidates the link; enabling it again creates a new
unguessable token. Verification pages request no search-engine indexing.

Renewal is assessment based. Within the configured window, learners with current
course access start a renewal and pass every current course quiz again. Every
practical photo task also needs trainer approval after renewal starts. Other
course completion requirements are still checked. A course without a quiz cannot
renew until its owner adds an assessment. Reading and SCORM work need not be
repeated merely because renewal started; their normal completion checks remain.

The server rechecks publication, payment/licence access, prerequisites, curriculum
version, quiz results and practical evidence before recording renewal. The
original certificate stays unchanged. Each renewal retains its start/completion,
new expiry, course version and curriculum digest. Retries reuse the completed
award; revocation applies to the whole credential and cannot be bypassed by renewal.

Current certification in prerequisites, gradebooks, cohort reports, course
analytics, platform analytics and compliance uses the latest valid renewal.
Expired awards remain historical facts in xAPI exports. Delivery to an external
learning-record system still needs counterpart testing.

Migrations 0060 and 0061 are applied. Rollback-only role tests passed for policy
snapshots, premature renewal denial, stale quiz/photo denial, successful renewal,
idempotent retry, expired prerequisites, sharing privacy/disable/token rotation,
outsider denial, public revocation and server-report grants. The application suite
passes 242 tests with 17 environment-gated skips. Browser journeys remain pending.
