# Organization learning boundaries

Course authors use the Privacy button in Course Studio to scope an unpublished
canonical course to an organization they belong to. Public publishing remains
the default for existing courses. Published course scope cannot change until
unpublished; draft revisions inherit the canonical course's scope. Author
ownership remains in place, including access to their own authored work.

A private published course's metadata and lessons are available only to its
organization members and its author. Prerequisites, course payment/licences and
assessment conditions still apply. A purchase alone does not bypass organization
membership. The same course-visibility helper governs assessments, submissions,
certificate claims, tutor context and referenced SCORM-package access. The SCORM
bucket is private and the file proxy checks learner package visibility.
Publicly hosted or independently shared media retains its provider's access
rules; these controls are not DRM and do not erase previously downloaded content.

Cohort owners who manage an organization can bind a cohort to it in cohort
administration. Every existing member must belong to that organization, and
private course/program assignments must be compatible. A bound cohort cannot
be transferred. Membership and assignment triggers enforce those boundaries on
future changes. Removing an organization member also removes their memberships
and reporting grants in its bound cohorts. Named licences remain consumed;
personal purchases and historical certificates remain unchanged.

Course copies, draft revisions and content archives retain the private scope.
Private archive restoration requires organization membership and preserves that
scope. New publication and existing author-review checks remain separate.

Community access now checks non-revoked course completion plus organization
membership on every roster/message access. Expired public-course completers can
remain alumni; a revoked certificate or lost private-organization membership
ends community access. Old direct-message history stays with its participants;
new messages require a currently authorized shared community. This also removes
a recursive roster policy from the earlier community implementation.

Account changes clear and cancel learning-query caches and remount route state.
Token refresh for the same account keeps its cache. This prevents a shared
browser from displaying another account's cached private course data.

Migration 0065 is applied. Rollback-only tests passed for anonymous/other-tenant
denial, paid-but-wrong-tenant denial, authorized SCORM/lesson reads, private
community scoping, compatible cohort/program assignments, retained private
copies/revisions/archives, removal, reporting and certificate finalisation.
Earlier organization/archive/program/certificate/licence/quiz suites also passed.
The application suite passes 258 tests with 17 environment-gated skips;
TypeScript and production build pass. Independent concurrent-connection and
browser checks remain pending.

Migration 0066 adds dedicated tenant-manager cohort controls, scoped learning
overviews/reports and creator-only named-licence billing. See
docs/ORGANIZATION_COHORT_MANAGEMENT.md.
Migration 0067 adds organization-owned programs maintained by current workspace
managers; existing personal programs retain their prior ownership. Question-library collaboration is explicitly
granted independently. Full corporate resource ownership, tenant-specific
identity providers, domains and complete shared-shell branding are not claimed.
