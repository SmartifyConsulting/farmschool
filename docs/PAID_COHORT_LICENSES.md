# Paid cohort licences

The commercial model selected for this build is named learner licences at the
course's listed per-learner price. These are not reusable or transferable seats.

## Administrator workflow

1. Open Administration > Cohorts and select a cohort you own.
2. Assign a published paid course to that cohort.
3. In Paid course licences, choose the course and quantity (1–1000).
4. Continue to Stripe and explicitly confirm payment there. A redirect alone
   never activates licences; the signed payment webhook must confirm the order.
5. On return, the cohort and purchase are selected. Once the order is active,
   choose cohort members and confirm permanent named allocations.
6. Use the purchase's CSV export to report purchased, consumed and unallocated
   licences, named learners and access-control status.

Each allocation permanently consumes one purchased licence. Removing a learner,
removing the course assignment or suspending access does not free their seat for
another person. Re-adding the same learner can restore access to their existing
enabled seat. Allocation and suspension/restoration events retain an audit trail.

A funded, enabled group licence gives paid-course entitlement only while the
course remains assigned and the learner remains a member. Publication and course
prerequisites still apply. A personal course purchase remains independent: group
refunds or suspension never overwrite it. Learners can complete assessments and
claim certificates through group access without creating fake personal purchases.
Previously earned certificates remain historical achievements when access ends.

## Payment safeguards

The database saves the course, buyer, cohort, unit price, currency and quantity
before checkout. Stripe quantities/prices come from that saved order. Repeating
the same request reuses its order and Stripe idempotency key; a bound checkout
session is resumed. Pending creation requests expire after 23 hours so an old
request is not reused beyond the provider's idempotency retention window.

The signed webhook routes group purchases to a separate processor and verifies
the saved order and exact amount/currency/quantity before activation. Duplicate
events do not add licences. Full refunds revoke the group purchase; disputes
suspend it; won disputes restore it. Event ordering prevents an older dispute or
late payment event from restoring a refunded purchase. Partial refunds retain
access, matching the existing refund policy; proportional seat reductions and
partial seat-refund workflows are not implemented.

The existing server settings `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` and
`SITE_URL` are required. The webhook uses the existing `/api/stripe-webhook`
endpoint and existing event subscriptions. Checkout uses the
[Stripe Checkout Session API](https://docs.stripe.com/api/checkout/sessions/create)
and [idempotent requests](https://docs.stripe.com/api/idempotent_requests).
Checkout creation requests are capped at a supported total of 99,999,999 minor
currency units. Taxes, discounts, recurring licences and negotiated group pricing
are not introduced by this change.

## Validation and remaining checks

Migration 0059 is applied. Rollback-only database checks exercise unpaid orders,
amount validation, duplicate events, capacity, permanent consumption, access
suspension/restoration, membership changes, prerequisites, licensed certificate
issuance, disputes/refunds and independent personal purchases. Mocked checkout
and signed-webhook tests cover provider routing and retry behaviour.

No real payments, refunds or emails were made. Browser checkout/return journeys,
actual Stripe test-mode event deliveries and independent concurrent-connection
load tests remain outstanding. Applying database changes and pushing code does
not by itself verify application deployment or provider configuration.
