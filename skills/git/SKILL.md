---
name: git
description: Safely develop on the latest GitHub main branch without overwriting concurrent work.
---

# Git — Safe Main-Branch Development

Use this workflow for GitHub-connected projects unless the user explicitly changes it.

1. Identify repository, default branch, permissions, and repository instructions (including AGENTS.md).
2. Fetch/pull the latest remote main before making changes; inspect working tree and never discard uncommitted work.
3. Make only targeted edits; preserve existing features, integrations, database migrations and user data.
4. Run applicable type checks, lint, build and tests. Disclose checks not run.
5. Immediately before committing, fetch main again and compare HEAD. If it changed, reconcile concurrent changes and revalidate.
6. Commit small descriptive changes directly to main using ordinary non-force operations. Use expected SHAs / optimistic concurrency when supported.
7. Verify the resulting remote commit and report its SHA and changed files.
8. Never force-push, rewrite history, reset shared branches, amend published commits or overwrite concurrent work.
9. Stop and report conflicts that cannot be safely reconciled.
10. Never commit credentials. Flag exposed secrets for rotation and secure removal.
11. If write permissions or branch protections block a commit, report the blocker rather than claiming success.
12. Avoid Lovable prompt credits when direct GitHub coding is possible; note that other services may still incur charges.

Workflow: fetch → inspect → edit → validate → recheck HEAD → reconcile → commit → verify.

For Lovable-connected repositories, preserve Git history and synchronization.
