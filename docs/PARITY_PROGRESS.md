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
- The logo is 15 percent larger. Desktop primary navigation is now a fixed left
  sidebar; mobile keeps its compact navigation. Sidebar/logo/view-toggle changes
  were pushed to main in commit ddb0491. This change set saves the remaining
  learning, reporting, security and payment work.
- Payment lifecycle handling is implemented locally: signed webhook validation,
  delayed-payment success, full-refund revocation, dispute suspension, restoration
  on a won/closed inquiry, partial-refund retention and retryable processing
  failures. Stripe lookups link refund/dispute events to their Checkout session.
- Migration 0042 adds transactional payment-event recording and entitlement
  updates, event deduplication, refund precedence and dispute ordering. Revocation
  applies to database content visibility as well as the learner interface.
  The migration is not applied and its database integration tests have not run.
  Deploy it before the new webhook code. Subscribe the Stripe webhook to
  checkout.session.completed, checkout.session.async_payment_succeeded,
  charge.refunded, charge.dispute.created and charge.dispute.closed.
  Test in Stripe test mode before production deployment. No payments were made.

## Remaining work

1. Run database integration tests against a migrated isolated database, then
   exercise cross-user access and complete learner/trainer journeys.
2. Make certificate validation and issuance transactional with course revision
   and trainer approval; add historical-certificate validity/revocation rules.
3. Verify reporting at production scale and under concurrent changes.
4. Apply and test payment migration 0042 in an isolated database; verify real
   Stripe test-mode deliveries, retries and refund/dispute purchase recovery.
5. Validate xAPI with an LRS; implement portable SCORM export and LTI delivery.
6. Transfer actual lessons/assessments to Moodle or clearly expose shell-only
   publishing; verify user matching and completion synchronisation.
7. Build cohort administration, enrolment, due dates, notifications and manager
   reporting on the existing database foundations.
8. Build competency/rubric authoring, assessment, mastery evidence, reusable
   question banks, gradebook and assignment workflows.
9. Expand authoring/media conversion and review against Coursebox workflows,
   including scanned-document handling and export fidelity.
10. Verify accessible, multilingual and mobile/offline delivery, backup/restore,
    operational monitoring and realistic load handling.
11. Workplace scope: tenant isolation and branding, organisation hierarchies,
    programs, recurring certification, dynamic rules and scheduled reports.

No Lovable AI generation or paid AI calls were made. Committing application
code does not establish production deployment. The connected database received only the permission
migration described above; learner records were not edited.
