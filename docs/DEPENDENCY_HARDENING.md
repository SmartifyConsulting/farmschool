# Dependency verification — 12 November 2026

The OCR implementation prompted a fresh Bun-lockfile audit. Production packages
included the affected PDF.js 5.7.284 release and Zod 3.25.76; the lockfile also
contained affected shell quoting, serialization and source-map dependencies.

The PDF reader was pinned to patched 6.2.108 with the OCR change. This follow-up
pins application Zod to 4.6.6, enforces that version for nested copies, moves Vite
to its 8.1.7 maintenance release and updates compatible transitive versions of
shell-quote, seroval, js-yaml, nanoid, source-map-js, brace-expansion and
launch-editor. Gradebook and Stripe event dictionaries now specify string keys
explicitly for Zod 4. A regression check confirms valid grade dictionaries retain
zero scores and empty competency collections through validation.

Final `bun audit --production --json` returned no advisory packages. The full
development audit still reports moderate esbuild and minimatch advisories in
development tooling. No advisory was suppressed. This result describes the
installed lockfile at this date, not a claim that the application is secure or
that no future vulnerability can be discovered. Dedicated browser, provider,
concurrency and operational verification remain in the build backlog.

Relevant published advisories:

- [PDF.js](https://github.com/mozilla/pdf.js/security/advisories/GHSA-hq66-cqwq-w95j)
- [Zod input validation](https://github.com/advisories/GHSA-mrhx-c7xc-m3w5)
- [shell-quote](https://github.com/ljharb/shell-quote/security/advisories/GHSA-pqg4-j6r4-53mv)
