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

Trainer competency assessment is available from each Studio course card.
Course authors can define competencies, select eligible learners and record
observed outcomes with scores and supporting feedback. Assessments are appended
to history rather than overwritten. Revision cards link to the original course's
assessment workspace so deleting a revision cannot remove assessment records.
Learners can open My Learning > My skills
to view the latest outcome per competency and its assessment history.
This is manual trainer assessment; it does not yet implement criterion-level
rubric scoring or automatically affect certificate eligibility.
Migration 0045 is applied. Rollback-only authenticated-role checks verified
author-only assessment, learner-private results, immutable assessment history,
score validation and exclusion of refunded paid-course learners. Checks are
saved in drizzle/tests/0045_competency_access.sql.

The notifications page now uses real cohort assignments instead of sample
activity. In-app reminders show new assignments, deadlines within seven days
and overdue work. Read status is saved per learner; changed deadlines and
new overdue reminders become unread. Certified courses and removed assignments
are excluded. Desktop/mobile bells display unread reminder counts.
Migration 0044 is applied. Rollback-only authenticated-role checks confirmed
learners can read/write only their own read receipts. Reproducible checks are
in drizzle/tests/0044_notification_access.sql. These are in-app reminders,
refreshed while using the app, not scheduled email or push delivery.

1. Run database integration tests against a migrated isolated database, then
   exercise cross-user access and complete learner/trainer journeys.
2. Make certificate validation and issuance transactional with course revision
   and trainer approval; add historical-certificate validity/revocation rules.
3. Verify reporting at production scale and under concurrent changes.
4. Verify real Stripe test-mode deliveries, webhook subscriptions, retries and
   refund/dispute purchase recovery; the payment migration is applied and its
   state transitions have passed rollback-only database assertions.
5. Validate xAPI with an LRS; implement portable SCORM export and LTI delivery.
6. Transfer actual lessons/assessments to Moodle or clearly expose shell-only
   publishing; verify user matching and completion synchronisation.
7. Extend cohort administration with enrolment/licensing policies, scheduled email/push reminders,
   manager reporting and browser-tested trainer/learner workflows.
8. Extend trainer competency assessment with criterion-level rubric authoring
   and scoring, learner submissions, reusable question banks and a full gradebook.
9. Expand authoring/media conversion and review against Coursebox workflows,
   including scanned-document handling and export fidelity.
10. Verify accessible, multilingual and mobile/offline delivery, backup/restore,
    operational monitoring and realistic load handling.
11. Workplace scope: tenant isolation and branding, organisation hierarchies,
    programs, recurring certification, dynamic rules and scheduled reports.

No Lovable AI generation or paid AI calls were made. Committing application
code does not establish production deployment. The connected database received
migrations 0041 through 0045. Test fixtures were rolled back; existing learner
records were not edited.
