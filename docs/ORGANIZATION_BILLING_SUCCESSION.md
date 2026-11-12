# Organization billing succession

The organization owner and a cohort's active workspace-manager creator have
billing authority for its organization-bound licences. The owner can appoint
other current workspace managers per cohort, with a reason and an optimistic
version check. Ordinary workspace management alone does not grant commercial
inventory access. Unbound platform cohorts keep their original administrator
owner rules.

Authorized billing managers can start new purchases, allocate existing funded
licences, export inventory and suspend/restore named learner access. New orders
record the current initiating buyer. Handover does not rewrite an earlier order's
buyer, processor session, price, funding state or permanent learner allocation.
Suspension and membership removal never release named capacity.

Revocation ends future commercial reads/actions. Demoting or removing a manager
clears explicit billing delegations so promotion/rejoining cannot silently
resurrect them. Audit events retain appointment and revocation reasons.
Already-funded learner access continues independently of the manager's role.

A successor can resume an already-bound, unexpired pending checkout through a
read-only server action that checks row permissions and cohort identity. It
returns the saved secure provider URL without creating another session/order or
changing its buyer. If initial checkout binding never completed, its original
buyer must retry the idempotent creation request. Old requests require payment
status review before replacement; the app does not automatically charge again.

Migration 0068 is applied. Rollback-only checks passed for owner appointment,
rejected self-appointment, delegated commercial reads, funded-seat allocation,
new-buyer orders, preserved original buyers, permanent seat consumption,
revocation, role cleanup, no revived grants and retained learner access.
Earlier organization/cohort/licence/program suites also passed. Server tests
cover authorized bound-checkout resume, denied reads, missing binding, active
purchases, expired requests and unsafe URLs without contacting the provider.
The application suite passes 264 tests with 17 environment-gated skips;
TypeScript and production build pass. Real Stripe/browser and independent
concurrent-connection tests remain outstanding. No real payment was made.
