---
name: ship
description: Use when a PM-Central change is ready to go out — "ship it", "open the PR", "merge it", "promote to main". Runs the feature → dev → main flow with checks and the ask-before-every-merge rule.
---

# Ship a PM-Central change

Flow is **feature branch → `dev` → `main`**. `main` is production (Vercel,
pmilighthouse.app). Claude opens every PR and performs every merge, but **asks
before each merge and merges only after the user says yes** — feature→dev and
dev→main alike. Never push straight to `dev` or `main`.

## 1. Start from fresh `dev`
The session's designated feature branch is reused across PRs, so reset it before
new work (keep any uncommitted change with a stash):

```bash
git fetch origin dev
git stash            # only if there are uncommitted changes
git checkout -B <feature-branch> origin/dev
git stash pop        # only if you stashed
```

`git rev-list --left-right --count origin/dev...HEAD` must read `N 0` → `0 0`
after the reset. A branch still carrying already-merged commits makes a noisy PR.

## 2. Check before committing
Behavior changes are test-first (`tdd` skill). Then run what CI runs; fix
anything red before going further:

```bash
npm run typecheck
npm run lint         # eslint, zero warnings allowed
npm test
npm run build        # when routes, config or dependencies changed
```
CI (`.github/workflows/ci.yml`) runs the same four on every PR into `dev`/`main`
— a PR is not ready to merge while CI is red.

For a non-trivial diff, run `/code-review`. For anything touching
`src/middleware.ts`, auth, `/api/webhooks/*`, `/api/cron/*` or secrets handling,
also run `/security-review`.

## 3. Commit, push, open feature → dev
- One focused commit; the message says *why*, then what changed.
- End it with the attribution lines from the session's system reminder.
- `git push -u origin <feature-branch>` (retry network failures with backoff).
- Open the PR with base `dev`. Body: **Why / Change / Test**, plus a note when
  the change only takes effect after a sync run or env change.

## 4. Merge to dev — ask first
Ask "Merge #N into dev?". On yes: read the PR; `mergeable_state` `clean` →
merge (merge commit). `unstable` usually just means a deploy status is still
pending (Railway dev / Vercel preview) — not a required check; say so and merge.
`dirty` = conflict → merge `origin/dev` into the branch, resolve, re-check.

## 5. Promote dev → main — ask again
Open PR `dev` → `main` titled `Promote dev → main: <what ships>`. Ask
"Merge #M to production?". Only merge on a fresh yes — approval for the dev
merge does not cover production.

## 6. After the production merge
- Vercel auto-deploys `main`; no redeploy needed for code.
- **Env/settings changes are different:** a Vercel env var edit does nothing
  until a redeploy (Deployments → latest → ⋯ → Redeploy). Remind the user.
- If the change is a sync (`src/import/**`, `scripts/sync-*`), the nightly
  workflow runs from `main` — until it merges, the old code can overwrite a fix.
  Use the `verify-sync` skill to prove it.
- Run the `smoke-test` checklist when user-visible pages changed.

## Red flags
- Merging because the user approved an *earlier* PR.
- Opening dev→main while the feature PR is unmerged.
- A PR from a branch that is behind `origin/dev`.
- Saying "deployed" when only `dev` has it.
