# PM-Central

A property management hub. The foundation is a **list of properties**, backed by
a real database, designed to pull data from many places (Rentvine, manual entry,
other feeds) and grow into a full Rentvine-style tool over time.

## Stack

- **Next.js (App Router) + TypeScript** — app shell and pages
- **Tailwind CSS** — UI
- **Prisma + Postgres** — the database, the same locally and in production
  (see [DEPLOY.md](./DEPLOY.md))

## The database

Modeled on the property-management domain so the hub is comprehensive from day one:

```
Portfolio → Property → Unit → Lease
Contact (owner / tenant / vendor / association)
WorkOrder · Inspection · Transaction · Bill
Note · Tag (attach to any record)
```

Every core record carries a `source` (e.g. `manual`, `rentvine`) and an optional
`externalId`, so imports from different systems merge cleanly instead of
duplicating.

## Getting started

```bash
docker compose up -d db   # local Postgres (or use a free Neon DB — see DEPLOY.md)
npm install               # installs deps and runs `prisma generate`
npm run db:push           # creates the tables from the schema
npm run db:seed           # loads sample properties, units, leases, tenants
npm run dev               # http://localhost:3000
```

To deploy so others can see it, see **[DEPLOY.md](./DEPLOY.md)**.

Useful:

```bash
npm run db:studio    # browse/edit the database in Prisma Studio
```

## Structure

```
prisma/
  schema.prisma      # the database
  seed.ts            # sample data
src/
  middleware.ts      # login gate (HTTP Basic Auth)
  lib/prisma.ts      # Prisma client singleton
  lib/format.ts      # currency / address helpers
  app/
    layout.tsx       # sidebar + shell
    page.tsx         # dashboard
    properties/      # properties list + detail
    portfolios/ leases/ tenants/ work-orders/   # screens
```

## Roadmap

- [x] Database schema for the full PM domain
- [x] Properties list (page one) with occupancy + rent roll
- [x] Property detail
- [x] Rentvine import (adapter → upsert on `source` + `externalId`)
- [x] Portfolios, leases, tenants, work-order screens
- [x] Dashboard with delinquencies, expirations, vacancies
- [x] Login gate (HTTP Basic Auth) for public deploys
- [x] Deployable to any host (Postgres + Dockerfile) — see DEPLOY.md
- [ ] Add / edit forms
- [ ] Multi-tenant accounts (for selling as a product)
