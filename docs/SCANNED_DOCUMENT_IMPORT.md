# Local scanned-PDF recognition

Studio manual import now offers an explicit local recognition checkbox for
printed English PDFs. Native text extraction remains the default. Recognition
runs only for pages containing fewer than 24 embedded text characters; other
pages keep their original extracted text. Original document/page references
continue into the existing draft review workflow.

The interface shows page progress, supports cancellation and highlights pages
with recognition confidence below 70. Sparse pages are flagged even when OCR is
off so authors can check mixed native/scanned documents. Recognition confidence
is an engine estimate, not a guarantee of correct wording. Authors must check
spelling, numbers and reading order before importing and publishing lessons.

Limits: 12 MB per document, 500 total PDF pages, 20 recognized pages, one million
extracted characters, at most four million rendered pixels per page and one OCR
worker per page session. The recognition worker has a three-minute budget from
initialization. Exceeding a limit fails the import instead of returning a partial
document. Resources are cleaned after success/failure/cancellation. If startup
hangs, cancellation returns control while the single-worker reservation remains
until the initialization promise can terminate it; reload recovers that session.

Pinned Tesseract.js 7.0.0 and English data 1.0.0 are in the Bun lockfile. The PDF
reader is pinned to the patched 6.2.108 release following the
[PDF.js advisory](https://github.com/mozilla/pdf.js/security/advisories/GHSA-hq66-cqwq-w95j).
XFA processing is disabled. Build/dev
configuration copies the worker, all six engine variants and English language
data from installed packages into generated same-origin static assets. These
assets are excluded from Git, included in the production build, and lazily loaded
when recognition is used. Worker/core licence notices are copied alongside them.
The client sets explicit same-origin worker/core/language paths; source pages are
not uploaded for recognition, and no AI model or Lovable credits are used.

Scope: English printed text. This does not reconstruct diagrams, tables, original
layout, handwriting or scanned content embedded on otherwise text-rich pages.
The separate content-library metadata analyzer retains its existing text-only
extraction behavior. Saving reviewed content continues through existing author,
draft and publishing controls; recognition does not publish or call AI itself.

Verification: the real Node recognition engine recovered known printed training
text from a synthetic image with reported confidence 96. This confirms the engine
and language data, not browser rendering. Mocked PDF workflow tests cover mixed
documents, opt-in, page caps, cancellation and cleanup. Worker tests cover local
asset paths, concurrency and in-flight cancellation; pixel bounds have separate
checks. Current suite: 277 passed, 17 environment-gated skips. Production build
and type checks passed. A fresh production build includes ten OCR assets totaling
28,864,721 bytes. Browser loading/cancellation and representative customer scans
remain unverified.

Implementation reference: [Tesseract local installation](https://github.com/naptha/tesseract.js/blob/master/docs/local-installation.md)
and the installed v7 worker's core-selection code. Tesseract.js/core use Apache
2.0 licences; the English package identifies MIT licensing in its metadata.
