# PM-Central — notes for Claude

## What this is
A property management hub, built as a real app (Next.js + Prisma). The
foundation is a list of properties. Goal is a Rentvine-style tool that pulls
data from many sources and could be sold as a product.

## Conventions
- **Stack:** Next.js App Router + TypeScript + Tailwind + Prisma on
  **PostgreSQL** (local dev uses a free managed Postgres — Neon/Supabase — set
  via `DATABASE_URL`). Chosen so it scales to a sellable multi-tenant product.
  See `DEPLOY.md`.
- **Data sources:** every core model has `source` + `externalId`. Imports must
  **upsert on `(source, externalId)`**, never blind-create, so re-syncing is
  idempotent. `source = "manual"` for hand-entered records.
- **Enums:** status/role fields are kept as `String` (not Prisma enums) for
  portability, with the allowed values documented in `schema.prisma` comments.
- Server components query Prisma directly (see `src/app/(app)/properties/page.tsx`).
  Keep the Prisma client import via `@/lib/prisma`.
- **Auth:** `src/middleware.ts` gates the whole app. `AUTH_MODE=supabase`
  (production) uses per-user Supabase login (`/login`, roles from app_metadata);
  `AUTH_MODE=basic` (default/dev) uses a shared `BASIC_AUTH_USER` /
  `BASIC_AUTH_PASSWORD`.

## Branching & deploys
Flow is **feature branch → `dev` → `main`**. `main` is production
(pmilighthouse.app); nothing is live until it reaches `main`. Some workflow
dispatches (e.g. the admin Data page Refresh buttons) also require the workflow
to be on `main`.

Claude **always opens the pull requests**:
1. Open the **feature → `dev`** PR for the change.
2. Once it's on `dev`, open the **`dev` → `main`** promotion PR.

Claude **performs the merges** (both feature → `dev` and `dev` → `main`), but
**always asks the user for approval first and merges only after they say yes** —
every merge, including the final `dev` → `main` to production. Never merge
without asking first, never leave a promotion for the user to open manually,
and never push straight to `dev` or `main`.

> **Temporary auto-merge window — through 2026-11-06 (inclusive).** The user
> granted standing approval (2026-10-30) to merge without asking, for both
> feature → `dev` and `dev` → `main`. Conditions: CI green on the current head,
> no merge conflict; tell the user after each merge what went in; still ask
> first if a promotion picks up changes that didn't come from this approval's
> work (e.g. another session's PR on `dev`); stop immediately if the user says
> so. **After 2026-11-06 this note is void** — go back to asking before every
> merge, and remove this note in the next PR.

**Hosting: production is on Vercel; dev is still on Railway** (until dev moves
to Vercel Preview — see `DEPLOY-VERCEL.md`). Both auto-deploy their branch
(`main` → Vercel prod, `dev` → Railway dev), so **code merges deploy
themselves** — no reminder needed. But changing an **env var or setting**
pushes no code, so nothing redeploys: the running app keeps the old value.
Whenever the user changes a variable, remind them to redeploy that service
(Vercel: Deployments → latest → ⋯ → Redeploy) and to set it in the right
place — prod and dev are separate. Prod `DATABASE_URL` on Vercel must be Neon's
**pooled** endpoint. This sandbox can't reach the live site; use the
`smoke-test` and `verify-sync` skills to check a deploy.

## Testing — TDD is the default
Every behavior change (feature, bugfix, logic refactor) starts with a failing
test, then the code — see the `tdd` skill for this repo's patterns. Tests live in
`tests/` (Vitest + Testing Library), mock the DB and every external API, and need
no secrets. CI (`.github/workflows/ci.yml`) runs typecheck, lint, tests and a
production build on every PR into `dev`/`main`; don't merge on red.
`npm test` · `npm run test:watch` · `npm run typecheck` · `npm run lint`.

## Commands
- `npm run db:push` **only against an empty/throwaway database.** The shared
  Neon DB also holds tables not modeled here (`activities`, `payments`,
  `work_orders`, `rv_work_orders`, `sync_status` — written by the
  leadsimple-search sync), and `db push` would try to **drop** them. To add or
  change a Prisma model on a populated DB, write idempotent additive SQL in
  `prisma/sql/*.sql` and apply it with
  `prisma db execute --file prisma/sql/<file>.sql --schema prisma/schema.prisma`
  (see `prisma/sql/showings.sql` and DEPLOY.md).
- `npm run db:seed` to reload sample data
- `npm run dev` to run

## Skills
Project skills live in `.claude/skills/` — use them instead of re-deriving:
`tdd` (test-first, this repo's test patterns), `ship` (PR + merge flow), `verify-sync` (prove a sync/secret via Actions logs),
`rentvine-api` (endpoint shapes, quirks, probe-and-log), `db-change` (additive
SQL, never `db push`), `reconcile-rentvine` (app vs. Rentvine discrepancies),
`smoke-test` (post-deploy checks), `add-dashboard-panel`, `rentvine-report-page`.
When you learn something new about Rentvine or a workflow, update the skill.

The `ai-skills` plugin (marketplace `dlandman27/ai-skills`, reviewed before
install, `autoUpdate` off — re-review before updating) adds general skills such
as `test-driven-development`, `systematic-debugging` and
`verification-before-completion`. This repo's rules win where they conflict
(e.g. Claude *does* open PRs here). Also use the built-ins: `/code-review` on
non-trivial diffs, `/security-review` on auth, middleware, webhook, cron or
secret-handling changes.

## Open work
See `BACKLOG.md` and `TODO.md`.
