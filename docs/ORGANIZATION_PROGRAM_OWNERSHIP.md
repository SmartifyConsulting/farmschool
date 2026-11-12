# Company-managed programs

Workspace managers open Manage organization programs from their learning
workspace. Company programs belong to that organization, while the original
creator remains recorded for provenance. Current workspace managers can maintain
drafts, publish immutable versions and assign them to cohorts in the same
organization, including cohorts created by another manager. They do not need
platform administrator roles. Existing personal/platform programs keep their
previous ownership model; they are not silently adopted into a company.

Company programs can reference published public courses and private courses from
their own organization. A company program containing only public courses is
still restricted to its own organization's cohorts. Managers cannot move or
adopt another company's program by guessing its identifier. Former managers
lose company-draft management access even when they originally created it.
Assigned learners see their published version, not the private management draft.

Publication and assignment preserve prior versions and cohort version pinning.
Saving/publishing/assignment are audited and use optimistic versions. Another
authorized manager can continue maintenance after the creator leaves or loses
their management role. The same editor supports company and existing platform
programs, with scoped data sources and server permission checks.

Program progress now hides current course titles when a course becomes an
inaccessible private course or an unpublished draft. A learner's own eligible
certificate may supply its original historical title, while unavailable current
course content stays hidden. A program snapshot does not grant course access.

Migration 0067 is applied. Rollback-only tests passed for non-platform creation,
colleague editing, immutable publication, cross-company read/write/assignment
denial, former-creator restrictions, management succession, title redaction and
learner/published-version access. Existing program, organization cohort and
learning-boundary suites also pass. The application suite passes 260 tests with
17 environment-gated skips; TypeScript and production build pass. Browser and
independent concurrency/load verification remain outstanding.

Course authorship remains unchanged. Company ownership of programs does not
automatically grant course editing, quiz-key access or commercial billing powers.
