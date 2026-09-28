# PM-Central

A property management hub. The foundation is a **list of properties**, backed by
a real database, designed to pull data from many places (Rentvine, manual entry,
other feeds) and grow into a full Rentvine-style tool over time.

## Stack

- **Next.js (App Router) + TypeScript** — app shell and pages
- **Tailwind CSS** — UI
- **Prisma + SQLite** (dev) — the database; swaps to **Postgres** for production
  by changing the datasource provider in `prisma/schema.prisma`

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
npm install          # installs deps and runs `prisma generate`
npm run db:push      # creates the SQLite database from the schema
npm run db:seed      # loads sample properties, units, leases, tenants
npm run dev          # http://localhost:3000  → opens on /properties
```

Useful:

```bash
npm run db:studio    # browse/edit the database in Prisma Studio
```

## Roadmap

- [x] Database schema for the full PM domain
- [x] Properties list (page one) with occupancy + rent roll
- [x] Property detail
- [ ] Rentvine import (adapter → upsert on `source` + `externalId`)
- [ ] Portfolios, leases, contacts, work-order screens
- [ ] Add / edit forms
- [ ] Auth + multi-tenant (for selling as a product)
