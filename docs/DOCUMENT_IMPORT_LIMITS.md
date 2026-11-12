# Document import resource limits

DOCX and PPTX imports now inspect their compressed directory before creating entry
objects. Imports reject over 2,000 entries, inconsistent directories, encrypted
entries, split/ZIP64 archives and unsafe embedded paths. XML/relationship contents
are read in bounded streams, capped at 8 MB per entry and 32 MB combined. Reads
pause and reject on a limit, cancellation or time budget. Document type/entity
declarations are rejected before passing content to an Office parser.

All supported imports enforce the one-million-character extracted text limit and
check cancellation before returning content. PDF rendering additionally caps
individual image pixels and canvas allocation through PDF.js options. Existing
12 MB source-file, page-count and local OCR limits remain in place.

These checks bound document-processing work. They do not scan uploaded content
for malware, implement storage quotas, or certify files as safe. Office formats
outside these limits need conversion or splitting before import. Text extraction
and author review remain separate from publication.

Verification: compressed expansion, directory checks, entity/path rejection and
cancellation tests passed. Current suite: 306 passed, 17 environment-gated skipped.
Type checking and production build passed. Browser imports remain unverified.
