# Plusticity capability parity work

Target: the course creation and learning-management workflows documented by
Coursebox and Moodle LMS, with Moodle Workplace enterprise features tracked
separately. Full product parity is not yet established.

## Acceptance standard

A capability is complete only when a usable interface, server enforcement,
database permissions, error handling and meaningful tests support the intended
workflow. External integrations also require testing against a real counterpart.
Database migrations saved in Git are not evidence of deployed database state.

## Implemented in this change set, awaiting application deployment

- Quiz grading and Studio certificate claims check course visibility under the
  learner identity and fail closed on a denied or failed access check.
- Studio certificates require author-approved evidence for every photo task.
- Photo task indices are distinct across slides and outside the old slide-local
  index range. Existing practical photos must be uploaded and approved again
  under the corrected task identity. Historical certificates are unchanged.
- Migration 0041 removes direct learner writes to practical evidence and
  certificates. It was applied to the connected database during this session.
  Read-back checks confirmed learner INSERT/UPDATE/DELETE privileges are denied,
  server INSERT remains available, and both photo submission/review functions
  remain executable SECURITY DEFINER functions. Signed-in journey tests remain
  outstanding.
- Compliance reporting includes enrolments, cohort assignments and certificate
  holders with no progress rows. Certification determines compliance; viewing
  every lesson alone is insufficient. Unknown lessons do not inflate progress.
- xAPI export generates deterministic UUID version 5 statement IDs, includes
  fact timestamps in completion identities and bounds SCORM scaled scores.
  LRS acceptance and full conformance remain unverified.
- Reporting reads every page with exact row counts and deterministic ordering,
  including when the server returns fewer rows than requested. Failed reads
  stop the report instead of displaying partial results as complete.
- Regression tests cover access denial, approval requirements, task identities,
  never-started learners and certificate-based compliance.
- An opt-in read-only database suite checks RLS and learner write privileges for
  quiz attempts, certificates and practical evidence. It requires an explicitly
  configured STUDIO_TEST_DATABASE_URL.
- Studio and Catalogue default to cards; My Learning defaults to a list. Each
  page has a card/list toggle with its own saved browser preference.
- The logo and sidebar have been resized and the top blue banner removed.
  Desktop primary navigation is a fixed left sidebar; mobile keeps its compact
  navigation. Sidebar/logo/view-toggle changes
  were pushed to main in commit ddb0491. This change set saves the remaining
  learning, reporting, security and payment work.
- Payment lifecycle handling is implemented locally: signed webhook validation,
  delayed-payment success, full-refund revocation, dispute suspension, restoration
  on a won/closed inquiry, partial-refund retention and retryable processing
  failures. Stripe lookups link refund/dispute events to their Checkout session.
- Migration 0042 adds transactional payment-event recording and entitlement
  updates, event deduplication, refund precedence and dispute ordering. Revocation
  applies to database content visibility as well as the learner interface.
  The migration is now applied. Rollback-only database assertions passed for
  duplicate events, refund precedence, dispute ordering, repurchases and RPC
  permissions. Reproducible SQL checks are in drizzle/tests/0042_payment_lifecycle.sql.
  The environment-gated Vitest database suite still requires a dedicated test
  connection. Subscribe the Stripe webhook to
  checkout.session.completed, checkout.session.async_payment_succeeded,
  charge.refunded, charge.dispute.created and charge.dispute.closed.
  Test in Stripe test mode before production deployment. No payments were made.
- Cohort owners can create groups, add/remove learners and assign published
  courses with optional due dates through Administration > Cohorts. Assigned
  courses appear in My Learning > Assigned, including learners who have not
  started. Assignments preserve prerequisite and payment requirements.
- Migration 0043 fixes cohort member read access. It was verified with actual
  authenticated-role RLS queries in a rollback-only transaction: members can
  read their cohort/assignments but cannot change membership, unrelated users
  cannot read them, and owners retain access. The migration is applied.
  Reproducible SQL checks are in drizzle/tests/0043_cohort_access.sql.

## Remaining work

Learners can now submit written competency work and optional HTTPS evidence
links from a course page. Each attempt preserves the task instructions, rubric
criteria, pass mark and version shown at submission. One pending attempt is
allowed per learner/competency; resubmission creates a new attempt after review.
Course authors review submitted work in the competency assessment workspace.
Scores are calculated against the submission's saved rubric, not a later edit.
Feedback and criterion breakdowns are visible to the submitting learner.
Migration 0047 is applied. Rollback-only authenticated-role tests passed for
private work, blocked self-grading, pending-attempt limits, immutable reviewed
work, historical-rubric grading, resubmissions and refunded-course access.
Reproducible checks are in drizzle/tests/0047_submission_access.sql. This first
submission workflow supports text and evidence links; file uploads, submission
deadline enforcement and advanced gradebook policies were tracked separately
and the new file/deadline capabilities are described below.

Submission deadlines now use each learner's earliest dated cohort assignment.
Trainers can allow labelled late work or block new late attempts per competency.
Server timestamps enforce the policy; each attempt saves its original deadline,
late flag and policy. Later extensions do not rewrite earlier work. Learners
without dated assignments have no deadline. Migration 0049 is applied and
rollback-only tests passed for multiple cohorts, late blocking/acceptance,
undated learners, retained snapshots and author-only/stale policy changes.
Checks are in drizzle/tests/0049_deadline_policy.sql.

Learners can attach one private evidence file per attempt, up to 5 MiB: PDF,
DOCX, TXT, PNG, JPEG or WebP. Uploads use unique learner/competency paths and
submitted files cannot be overwritten or removed by clients. Trainers can read
linked files for their courses, but cannot read unsubmitted learner uploads.
Downloads request short-lived signed attachment URLs. Metadata, MIME/extension
and size are validated when linking files; failed submissions attempt cleanup
only for unlinked files. Migration 0050 is applied. Rollback-only role tests
passed for storage metadata visibility, ownership, invalid metadata, attachment
linking/reuse and text-only compatibility. Checks are in
drizzle/tests/0050_private_file_access.sql. These SQL tests did not transfer or
download binary files; browser/Storage HTTP checks remain outstanding. File
content/malware scanning, storage quotas and scheduled orphan cleanup are not
implemented.

Course authors now have a paginated course gradebook linked from Studio and
the assessment workspace. It includes assigned learners who never started,
historical enrolments, valid lesson progress, latest quiz attempts, latest
competency outcomes, pending submissions and certificate status. Missing
grades remain empty and zero scores remain zero. Quiz/competency means are
reported separately and do not alter certificate rules. The current page can
be exported as CSV with formula-safe text cells. Migration 0048 is applied.
Rollback-only role tests passed for completeness, latest scores, empty grades,
pagination and blocked learner/unrelated-author access. Checks are saved in
drizzle/tests/0048_gradebook_access.sql. This is a read-only results matrix;
weighted course categories, grade overrides, moderation and whole-course export
are not yet implemented.

Trainer competency assessment is available from each Studio course card.
Course authors can define competencies, select eligible learners and record
observed outcomes with scores and supporting feedback. Assessments are appended
to history rather than overwritten. Revision cards link to the original course's
assessment workspace so deleting a revision cannot remove assessment records.
Learners can open My Learning > My skills
to view the latest outcome per competency and its assessment history.
Manual trainer outcomes remain available and do not automatically affect
certificate eligibility.
Migration 0045 is applied. Rollback-only authenticated-role checks verified
author-only assessment, learner-private results, immutable assessment history,
score validation and exclusion of refunded paid-course learners. Checks are
saved in drizzle/tests/0045_competency_access.sql.

Course competencies now support versioned rubrics with 1–30 criteria, weighted
by maximum points, and configurable pass marks. The server validates all marks
and calculates a percentage rounded to two decimals before applying the pass
threshold. Missing, extra, negative and over-maximum marks are rejected.
Each rubric assessment saves the original criteria, points, marks, threshold
and version. Learners and trainers can inspect these snapshots in assessment
history even after the rubric changes. Expected-version checks reject stale
saves and grading requests from another browser session.
Migration 0046 is applied. Rollback-only authenticated-role tests passed for
weighted scoring, rounding boundaries, snapshot preservation, stale versions,
private learner reads and blocked self-grading. Reproducible checks are in
drizzle/tests/0046_rubric_scoring.sql. These assessments still record trainer
observations; learner assignment submission and gradebook workflows remain.

The notifications page now uses real cohort assignments instead of sample
activity. In-app reminders show new assignments, deadlines within seven days
and overdue work. Read status is saved per learner; changed deadlines and
new overdue reminders become unread. Certified courses and removed assignments
are excluded. Desktop/mobile bells display unread reminder counts.
Migration 0044 is applied. Rollback-only authenticated-role checks confirmed
learners can read/write only their own read receipts. Reproducible checks are
in drizzle/tests/0044_notification_access.sql. These are in-app reminders,
refreshed while using the app, not scheduled email or push delivery.

Course Studio now includes a private question bank, also available inside each
draft quiz. Authors can create questions, save copies from existing quizzes,
search prompts, filter categories, page through the library, edit and delete
entries, and add independent copies to quizzes. All five existing question types
retain their private answer keys. Quiz imports enforce the 50-question and
five-written-response limits; existing course copies do not track library edits.
Migration 0051 is applied. Rollback-only authenticated-role tests passed for
owner-only reads, denied anonymous access/direct writes, stale edit/delete
rejection, answer validation and cross-user update/delete denial. Checks are in
drizzle/tests/0051_question_bank_access.sql. The combined code preserves the
Lovable sidebar/font release at 2208e6c. Validation: 170 tests passed, 17
environment-gated tests skipped, TypeScript and production build passed.
The question-bank interface still needs a signed-in browser journey. Shared
department banks, random exam pools, question usage history and Moodle question
format import/export are not implemented by this private copy-based library.

Studio certificate issuance now finishes in a service-only database transaction.
It locks the course, checks publication/access and the expected course version,
compares the full checked lesson manifest (including quiz/video content), and
rechecks progress, quiz passes, SCORM completion and author-approved photo tasks
before issuing. Photo task identities come from the existing server-side slide
parser; clients cannot call the issuance RPC or supply a trusted task manifest.
Curriculum writes now lock the parent course as well. New certificates retain
the issued title, version, validation time and curriculum digest. Claims are
idempotent; existing historical records are preserved without retroactive
validation, and revoked certificates cannot be replaced by claiming again.

Course authors can list and irreversibly revoke certificates with a recorded
reason from the course gradebook. Learners see completion-verified, historical
or revoked status, the issued version and any revocation reason. The open
certificate follows refreshed query data; the list refreshes every 30 seconds
while active and reads all pages. Revoked records stop satisfying prerequisites
and gradebook/compliance certification, and assignment reminders resume. They
remain in compliance candidate lists so a revoked-only learner does not vanish
from reporting. Current xAPI export omits revoked certificate completion facts;
voiding facts previously delivered to an external LRS remains unimplemented.

Migration 0053 is applied. Rollback-only role tests cover reading/quiz/SCORM/photo
requirements, mismatched version/manifest, paid access, untrusted approvers,
idempotency, private reads, service-only issuance, owner-only revocation,
prerequisite/gradebook effects, legacy preservation and retained issued metadata.
Checks are in drizzle/tests/0053_certificate_integrity.sql. Validation: 178 tests
passed, 17 environment-gated tests skipped, TypeScript and production build
passed. Lovable changes through e860284 are preserved. Signed-in browser QA and
independent-connection concurrency/load testing remain outstanding. Expiry,
renewal, public credential verification and certificate design templates are
not implemented by this change. Existing retained-lesson progress/quiz-credit
rules remain; this does not reset learning when a course revision is published.

Advanced grading now supports author-configured weighted categories (quiz and
competency items, weights totalling 100%). Missing scores leave the weighted
grade empty. Item membership is course-scoped, each item can appear once, and
configuration saves reject stale versions. Course authors may propose final
grade overrides with reasons; a different administrator must approve/reject
them through Administration > Grade Moderation. Decisions retain reasons and
review notes. Approved overrides apply only to their grading-scheme version;
they never rewrite quiz attempts or grant certificates. Whole-course CSV export
uses one database snapshot, reads every page, and fails above 10,000 learners
rather than presenting a partial export as complete.

Cohort policies now include seat limits, automatic enrolment for free published
assignments and explicit reporting-manager appointments. Automatic enrolment
never grants paid access or overwrites a purchase/refund. Seat enforcement locks
the cohort during membership changes. Reporting managers can view/export only
their appointed cohorts; administrators retain control of membership and policy
changes. Reports include unstarted learner/course pairs and separate payment
access from certification. Whole-cohort export reads all pages in one snapshot,
with a 10,000-pair ceiling and formula-safe CSV cells.

Individual course submission extensions retain a reason, version and append-only
event history. Only the course author can grant/remove them. The server uses the
later of the extension and earliest dated cohort deadline; an undated course
remains undated. Text and file-submission checks share the effective deadline,
while prior submissions retain their original deadline snapshots. My Learning
and in-app reminders reflect extensions. Managers see effective dates but do
not receive private accommodation reasons.

Migrations 0054 and 0055 are applied. Rollback-only role tests cover weighted
scores, missing/zero grades, self-review denial, stale reviews/configuration,
override retirement, 202-learner export, seat limits, free auto-enrolment,
purchase preservation, manager appointment/revocation and extension enforcement.
Validation: 184 tests passed, 17 environment-gated tests skipped; TypeScript and
production build passed. Signed-in browser journeys remain unverified.
Resend reminders now have a private outbox, scoped cohort status summaries,
learner opt-out, service-only enqueue/claim/acknowledgement functions and an
authenticated cron endpoint. Messages use stable provider idempotency keys,
bounded retries and immutable retry payloads. Eligibility is checked at claim
and immediately before provider delivery. Removed/changed assignments,
extensions, changed email addresses, opt-outs and certificates cancel obsolete
pending work. Delivery stays disabled, as requested, until the sender/API key
and hosting schedule are configured. Setup is in docs/COHORT_EMAIL_SETUP.md.
Migration 0056 is applied. Rollback-only role tests passed for deduplication,
leases, retry payloads, stale acknowledgements, opt-out and recipient changes.
Mocked provider/worker tests passed; no real emails were sent. The full suite
now has 194 passing tests and 17 environment-gated skips. Real-provider delivery,
the hosting scheduler and bounce/delivery-event handling remain unverified.
Shared banks, per-attempt random exam pools, portable question import/export,
paid licence pools and push delivery remain outstanding within priorities 3/4.

1. Run database integration tests against a migrated isolated database, then
   exercise cross-user access and complete learner/trainer journeys.
2. Browser-test certificate claiming and revocation; add public credential
   verification, expiry/renewal policy and auditable recertification. Stress-test
   issuance/revision/revocation with concurrent independent connections.
3. Verify reporting at production scale and under concurrent changes.
4. Verify real Stripe test-mode deliveries, webhook subscriptions, retries and
   refund/dispute purchase recovery; the payment migration is applied and its
   state transitions have passed rollback-only database assertions.
5. Validate xAPI with an LRS; implement portable SCORM export and LTI delivery.
6. Transfer actual lessons/assessments to Moodle or clearly expose shell-only
   publishing; verify user matching and completion synchronisation.
7. Extend cohort administration with enrolment/licensing policies, scheduled email/push reminders,
   manager reporting and browser-tested trainer/learner workflows.
8. Verify file transfers/deadline screens in the browser; add file content scanning,
   storage quotas/cleanup, individual deadline extensions, shared question banks
   and random exam pools,
   weighted course categories, overrides, moderation
   and whole-course grade export. The course gradebook, text/evidence-link
   submissions and versioned criterion-level rubric scoring are implemented.
9. Expand authoring/media conversion and review against Coursebox workflows,
   including scanned-document handling and export fidelity.
10. Verify accessible, multilingual and mobile/offline delivery, backup/restore,
    operational monitoring and realistic load handling.
11. Workplace scope: tenant isolation and branding, organisation hierarchies,
    programs, recurring certification, dynamic rules and scheduled reports.

No Lovable AI generation or paid AI calls were made. Committing application
code does not establish production deployment. The connected database received
migrations 0041 through 0051 and 0053 through 0056. Migration 0052 belongs to the intervening
Lovable API-management update and was not deployed by this certificate work.
Test fixtures were rolled back; existing learner
records were not edited.
