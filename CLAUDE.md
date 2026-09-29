# PM-Central — notes for Claude

## What this is
A property management hub, built as a real app (Next.js + Prisma). The
foundation is a list of properties. Goal is a Rentvine-style tool that pulls
data from many sources and could be sold as a product.

## Conventions
- **Stack:** Next.js App Router + TypeScript + Tailwind + Prisma. DB is
  **Postgres** everywhere (local + production) — point `DATABASE_URL` at a local
  Postgres (`docker compose up -d db`) or a hosted one. See `DEPLOY.md`.
- **Data sources:** every core model has `source` + `externalId`. Imports must
  **upsert on `(source, externalId)`**, never blind-create, so re-syncing is
  idempotent. `source = "manual"` for hand-entered records.
- **Enums:** status/role fields are kept as `String` (not Prisma enums) for
  portability, with the allowed values documented in `schema.prisma` comments.
- Server components query Prisma directly (see `src/app/properties/page.tsx`).
  Keep the Prisma client import via `@/lib/prisma`.
- **Auth:** the whole app sits behind an HTTP Basic Auth gate in
  `src/middleware.ts`, driven by `BASIC_AUTH_USER` / `BASIC_AUTH_PASSWORD`.

## Commands
- `npm run db:push` after editing the schema
- `npm run db:seed` to reload sample data
- `npm run dev` to run

## Next up
Rentvine import adapter → map Rentvine property/unit/lease/contact records onto
these models and upsert. The Rentvine MCP connector is the data source.
