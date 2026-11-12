# Course content archives

Course Studio's course actions include Export content archive. Only the course
owner can export the transactional content snapshot and private quiz keys. The
JSON file contains course metadata, modules, native lessons, quiz questions/keys,
supplementary library references and trainer activities. It contains no learner
progress, purchases, certificates or learner assessment evidence. Keep exported
answer keys private.

Course Studio also has a restore panel. A supported native archive restores as
a new unpublished course owned by the signed-in user, with new module/lesson
IDs. Quiz keys remain private; sampled quiz settings are preserved. Retry uses
the same restore request and returns the same draft. Failure rolls back every
insert. Activity and course approvals are not imported.

This is a native content archive, not a complete platform backup or a package
containing uploaded files. Prices, prerequisites, certificate policies, grading
schemes, competencies, publishing approvals and version history must be reviewed
or reconfigured. Supplementary library references require manual reconnection.
Source metadata remains in the exported file; only supported curriculum fields
are restored. Linked media files are not copied. Archives containing embedded
SCORM activities are rejected for automatic restore; retain and import the
original SCORM ZIP separately. Existing SCORM upload remains available.

Migration 0063 is applied. Rollback-only role checks passed for owner-only export,
private keys, content remapping, sampled quizzes, cleared approvals, unpublished
restore, nonce reuse/mismatch, atomic failure, unsupported package denial and
deletion of restored drafts. The application suite passes 248 tests with 17
environment-gated skips. Browser round-trip checks remain pending.
