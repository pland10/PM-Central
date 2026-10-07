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

Claude **always opens the pull requests** (the user reviews and merges):
1. Open the **feature → `dev`** PR for the change.
2. Once it's merged to `dev`, open the **`dev` → `main`** promotion PR.

Never leave a promotion for the user to open manually, and never push straight
to `dev` or `main`.

## Commands
- `npm run db:push` after editing the schema
- `npm run db:seed` to reload sample data
- `npm run dev` to run

## Next up
Rentvine import adapter → map Rentvine property/unit/lease/contact records onto
these models and upsert. The Rentvine MCP connector is the data source.
