# Organization-managed learning

Workspace managers use Organization learning in their organization page to
create bound cohorts, set capacity, opt into free-course auto-enrolment, manage
current workspace members and assign published public/private organization
courses with optional deadlines. Membership and private-course compatibility
guards remain in the database. Creation retries reuse their cohort identifier.
Settings use optimistic versions; changes are audited. Email activation is not
part of these controls and remains deferred.

The overview reports current workspace members, private courses in all states,
bound cohorts, distinct direct learner/course assignments and current verified
certificates for those assignments. Program-only course requirements are reported
in the separate scoped program reports. Workspace managers automatically receive
reporting access to their organization's bound cohorts and can use the existing
course/program report screens and CSV exports. They cannot report other tenants.

Migration 0068 extends billing to the organization owner and explicitly appointed
current billing managers, while preserving creator authority for active managers.
Other workspace managers can manage roster/training assignments and report
progress without commercial inventory access. Buyer identity,
verified provider payment, immutable pricing, capacity and permanent named-seat
rules are unchanged. Checkout returns bound-cohort buyers to the correct
organization page and selected purchase. No real payments were made to verify
the feature; real provider test-mode journeys remain pending.

Restrictive database policies prevent a former manager from using legacy cohort
ownership to edit a bound cohort or read a management roster. Ordinary assigned
learners retain their own cohort records. Legacy platform-only cohort mutation
functions also check the organization boundary. A manager's demotion stops their
new billing actions; it does not revoke learners' already-funded named access.
These controls never grant platform administrator roles.

Migration 0066 is applied. Rollback-only tests passed for non-platform-manager
creation, retries, capacity, tenant membership, free auto-enrolment, paid order
creation/funding/allocation, buyer-only commercial reports, same-tenant reports,
other-tenant denial, demoted-owner RLS and retained funded learner access. Payment
funding uses synthetic rollback-only events. Application tests verify scoped
checkout return paths and stop checkout if return scope cannot be confirmed.
The application suite passes 260 tests with 17 environment-gated skips;
TypeScript and production build pass. Browser and independent concurrency/load
testing remain outstanding.

Migration 0067 adds company-managed programs and managerial succession; see
docs/ORGANIZATION_PROGRAM_OWNERSHIP.md. Remaining enterprise work includes
dynamic assignment rules and scheduled reports, tenant-specific identity providers/custom domains, and full
company resource ownership beyond author ownership.
Billing succession is implemented in migration 0068; see docs/ORGANIZATION_BILLING_SUCCESSION.md.
