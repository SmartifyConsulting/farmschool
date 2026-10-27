<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

- Course catalogue is static in src/lib/courses.ts; per-learner state (lesson_progress, bookmarks, api_keys) lives in Lovable Cloud with own-row RLS — why: content is curated, learner data must persist.
- Learner API keys are stored only as SHA-256 hashes; src/lib/api-auth.server.ts enforces revocation, per-key scopes and daily limits for /api/public/v1/* routes; learners may only update safe columns (usage counters are server-only) — why: raw keys are unrecoverable and usage limits must not be self-editable.
- Learner profile details (name, region, role) live in a profiles table written by the client right after sign-up under own-row RLS; learner role is descriptive only, never used for permissions — why: no auth-schema triggers allowed, and access roles must stay in a separate roles table.
- Moodle is reached only from server functions in src/lib/moodle.functions.ts via src/lib/moodle.server.ts; the token lives in the MOODLE_TOKEN secret, the URL/status in the moodle_settings singleton (admin-only via has_role), synced courses cached in moodle_courses — why: tokens never reach the browser and the app keeps working when Moodle is down.
- The farming-challenge finder uses a signed-in streaming server route and server-only AI Gateway Responses helpers; recommendations are validated against the internal catalogue and durable provider denials stop new calls — why: learner challenges and secrets stay off public endpoints, suggestions cannot invent courses, and Moodle outages do not affect discovery.
