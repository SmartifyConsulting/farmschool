# Private exam question pools

Authors can select “Keep the complete question pool private” in a draft quiz.
This requires a random sample size, including when all questions should appear
in an attempt. Each save creates an immutable private bank version containing
questions and keys. The learner-readable lesson contains a fixed informational
placeholder plus pass mark, sample size and an opaque bank reference.

Only the bank's author can read the full bank through authenticated database
access. Learners, anonymous users and other authors cannot read it or mutate bank
rows. Saving requires ownership of an unpublished course. Publication checks
that references belong to the course author, have a valid sample/pass mark and
retain the expected placeholder. A guessed foreign bank reference cannot publish
or start an attempt, including in another author's own draft.

The signed-in server checks course access before loading a bank and selecting
indices. The database rechecks source identity, bank ownership, course/payment/
prerequisite access and the existing 50-new-attempt daily quota before storing a
snapshot. Responses contain only the selected questions with answer fields
removed. Grading uses private saved keys and the existing lease/finalization
transaction; direct submission without an attempt is rejected. Existing public
random pools remain available as an explicit alternative.

Copies and revisions retain immutable references owned by the same author.
Editing creates another bank; old attempts and other copies keep their original
questions. Author-only version snapshots and content archives materialize full
questions/keys with a private-bank flag. Native restoration creates a new private
bank rather than placing the full pool in public lesson content. Author exports
contain complete exam material and must be treated accordingly. The SCORM exporter
continues rejecting sampled exams that depend on the Plusticity server.

Limits: 1–50 questions, up to 200 KB of question/key data per bank and 10,000 bank
versions per author. Old versions are retained for copies/history; automatic
garbage collection is not implemented. This is private bank delivery, not
proctoring, adaptive testing or protection against learners sharing questions
they legitimately see. Previously public questions cannot be made unknown by
turning this option on. Full assessment-policy controls and broader question
formats remain separate work.

Migration 0073 is applied. Transactional SQL tests passed for learner/other-author
denial, selected-only start responses, matching private keys, grading/progress,
copying, retained-ID revisions, immutable old banks, private archive restoration
and foreign-bank rejection. Existing random-attempt and native archive SQL checks
also passed against the new schema. Code tests cover access-before-bank-read,
selection-only responses, mandatory attempts and privacy-preserving archive
validation. Current suite: 282 passed, 17 environment-gated skipped; production
build and type checks passed. Browser journeys and independent concurrency tests
remain outstanding.
