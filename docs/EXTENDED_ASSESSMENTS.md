# Extended fixed-answer assessments

Studio and shared/private question libraries support two additional formats:

- Select all correct answers: one point only for the exact set, in any response
  order. Missing/extra choices score zero; empty, repeated or invalid indices
  cannot be submitted as a complete response. Empty author options are removed
  while preserving correct-answer identities.
- Numerical answer: a private target value and nonnegative absolute tolerance,
  both bounded to one trillion in magnitude. Learners use a decimal point or
  scientific notation without units or commas. Zero tolerance compares the exact
  numeric value; nonzero tolerance has a small floating-point boundary allowance.
  Nonfinite, overflow and underflow-to-zero responses are rejected. Authors put
  required units in the question prompt; automatic unit conversion is not included.

The controls use existing server grading, private answer-key storage, publication
and attempt checks. Both formats work in ordinary quizzes, sampled pools and
private exam banks. Native question-bank files and course archives preserve
questions, keys and private-bank flags. SQL validation protects shared-library
saves, private banks and restored archives.

Standalone SCORM 1.2 grading supports these two fixed-answer types with the same
exact-set/absolute-tolerance rules. Sampled/private exam exports remain blocked
because they require server delivery. Player tests run in a Node VM with a fake
LMS API and DOM; browser/LMS conformance remains unverified.

Moodle XML supports numerical questions with one full-credit answer, absolute
tolerance and no unit conversion. Native exact-set multiple-response questions
are rejected by XML export: changing them into standard partial-credit choices
would change the grading contract. They can be transferred in the native format.
Partial-credit, unit-aware, calculated, cloze and adaptive assessments remain work.
See [Moodle XML format](https://docs.moodle.org/405/en/Moodle_XML_format) for the
numerical answer/tolerance structure; no new counterpart test has been performed.

Migration 0074 is applied. Rollback-only SQL checks passed for valid/invalid keys,
ordinary and private quiz saves, private archive restoration and selected prompt/
key alignment. Existing private-bank SQL checks also passed against the extended
validator. Code checks cover exact-set scoring, numeric boundaries, malformed
keys, native transfers, numerical XML and SCORM runtime grading. Current suite:
289 passed, 17 environment-gated skipped; type checking and production build
passed. Browser and external counterpart journeys remain outstanding.
