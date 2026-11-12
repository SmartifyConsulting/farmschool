# Exam attempt controls and recovery

Authors can save controls below a draft quiz after enabling and saving a question
sample. Choosing the entire pool makes a fixed-length exam. Private banks use the
same controls. Ordinary quizzes without attempt mode keep their existing workflow.

Controls include 1–1,000 starts per certificate-renewal cycle (or no custom cap),
a 1–1,440 minute time limit and 0–10,080 minimum minutes between starts. This
spacing is measured from the previous start, not from grading completion. The
existing safety quota of 50 new starts per learner across quizzes in 24 hours
still applies. Expired and abandoned starts consume the allowance. Existing
highest-score and successful-pass records are retained; alternative grade
aggregation, individual extra-time accommodations and proctoring are separate work.

The initial learner action starts or resumes an unfinished attempt. Recovery
keeps the original questions, keys, timer and saved answers even if the author
later publishes a different source sample. Replacing an unfinished attempt
requires confirmation, consumes another start and closes the old attempt.
Idempotent start request IDs prevent network retries consuming duplicate starts.

Answers save after a short editing pause and immediately before submission.
The interface distinguishes saved, pending and failed saves, supports retry and
allows reloading the last saved attempt. Version checks reject conflicting edits
from another tab. Saves are serialized so an older acknowledgement cannot mark
newer edits as saved. Only successfully saved answers survive leaving a page;
there is no guarantee for offline edits or navigating away before saving finishes.

The server enforces the deadline. The countdown uses server time plus elapsed
client time as a display aid. Submission saves and reserves the expected answer
version atomically before grading. A reservation made before the deadline can
finish within the existing five-minute grading lease; late submissions cannot
reserve a grade. Starting a replacement or losing paid/tenant/prerequisite access
prevents protected finalization. Time expiry does not automatically submit answers.

Starting certificate renewal closes unfinished attempts from the previous cycle
before opening the new allowance. A request ID from the old cycle cannot reopen
it. Previously completed renewals keep their own allowance boundary until the
next renewal begins. This does not erase historical attempts or awarded grades.

Policy settings are author-owned, draft-only and version checked. Published
settings require a revision or unpublishing. Copies, retained-ID revisions and
native course archives preserve settings; restored policies receive fresh IDs/
versions with the new course. Publication rejects policies attached to quizzes
outside attempt mode. Standalone SCORM export rejects controls it cannot enforce.

Migration 0075 is installed. It was tested transactionally before installation and its SQL checks passed again after installation. SQL checks cover
caps, spacing, start retry, draft conflicts, recovery after source/policy changes,
replacement closure, on-time grading grace, renewals, refunds, privileges and
copy/archive fidelity. Existing random-attempt and certificate-lifecycle SQL
checks also passed with the new schema. Code checks cover draft-write ordering,
failure/retry, stale acknowledgements, server-relative timing, authenticated draft
writes, version-bound grading and archive validation. Current suite: 298 passed,
17 environment-gated skipped; browser and independent concurrent-connection
journeys remain unverified.
