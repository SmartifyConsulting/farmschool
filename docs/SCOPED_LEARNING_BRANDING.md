# Scoped organization learning branding

Signed-in members now see their organization's logo/name and a readable shade of
its brand color on workspace pages and their subpages, private course learning,
course Studio and course gradebooks. The sidebar/mobile logo links to that
organization's workspace. Shared controls, focus rings and links use its primary
color within that page shell. The original Plusticity logo size and 240-pixel
sidebar remain the default outside those contexts.

Brand resolution checks the current account and route. A company course must be
visible in the caller's catalogue and the caller must currently belong to the
organization. Branding never grants paid course content, prerequisites, learner
data or management authority. Former members cannot retain the company's branding
through an authored course, although the existing author ownership rules still
apply to their course content. Signed-out users and unrelated tenants receive no
company branding data.

The read RPC returns only organization ID, display name, brand color and logo URL.
Client queries include account/context keys, refresh periodically and discard
branding on errors. The account boundary clears prior-account query data. Failed
logo loads fall back to the organization name. Logos require HTTPS without URL
credentials; requests omit the referrer. Names remain escaped text.

Light colors are shaded darker until the primary background has at least 7:1
contrast with white before conversion to the existing OKLCH design tokens. This
protects text readability rather than reproducing an unreadable light swatch.
Uploaded logo artwork still needs its own accessibility review.

Scope: contextual in-app branding, with platform legal/support links retained.
The aggregate catalogue/My Learning pages keep Plusticity branding. This does not
implement custom domains, branded public sign-in pages, email/certificate
templates, a branded SCORM player, or fully independent white-label hosting.

Migration 0076 is applied. Rolled-back SQL checks passed for matching workspace/
course branding, minimal projection, paid-content separation, cross-tenant denial,
anonymous denial and former-member fallback. Unit checks cover route resolution,
unsafe logo URLs and contrast bounds. Current suite: 301 passed, 17 environment-
gated skipped. Type checking and production build passed. Browser/mobile layout,
logo loading and color rendering have not yet been verified in the application.
