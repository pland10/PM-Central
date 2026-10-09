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
- Server components query Prisma directly (see `src/app/properties/page.tsx`).
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

**Railway auto-deploys code; env/settings changes need a manual redeploy.**
Railway watches each service's branch (`main` → prod, `dev` → dev) and
redeploys automatically on every push there, so **code merges deploy
themselves** — no reminder needed. But changing a **variable or any service
setting** in Railway pushes no code, so nothing triggers a deploy: a runtime
env var like `RESEND_API_KEY` stays invisible to the app until that service
redeploys or restarts. Whenever the user says they changed a Railway variable
or setting, remind them to redeploy that service (and to set it on the right
service — dev and prod are separate).

## Commands
- `npm run db:push` after editing the schema
- `npm run db:seed` to reload sample data
- `npm run dev` to run

## Next up
Rentvine import adapter → map Rentvine property/unit/lease/contact records onto
these models and upsert. The Rentvine MCP connector is the data source.
