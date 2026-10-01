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
- Learner API keys are stored only as SHA-256 hashes and verified in src/lib/api-auth.server.ts for /api/public/v1/* routes — why: raw keys are never recoverable from the database.
