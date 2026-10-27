# Deploying PM-Central

PM-Central is a Next.js app with its own **PostgreSQL** database (properties,
leases, portfolios, tenants, work orders — loaded from the import snapshot) and
it talks to **Supabase** for Search, Inspections, and Invoicing, and to
**Rentvine** for the balance sync. Postgres (rather than SQLite) is the
foundation for a sellable, multi-tenant product. It ships a `Dockerfile`, so the
same image runs on Railway, Render, Fly, or your own server.

> **Before it's public:** the app holds real tenant + billing data. Never
> expose it without a login — in production use `AUTH_MODE=supabase` (per-user
> login). Keep every `*_SERVICE_KEY` and the Rentvine secret server-side only;
> never put a secret in a `NEXT_PUBLIC_*` variable, and never commit `.env`.

---

## Local development

Use a free managed Postgres for local dev — no install needed. Create one on
**Neon** (neon.tech) or **Supabase**, copy its connection string into `.env` as
`DATABASE_URL`, then:

```bash
npm install
npm run db:push        # create the tables in your Postgres
npm run import         # load the PMI Lighthouse data
npm run sync:balances  # (optional) pull current balances from Rentvine
npm run dev            # http://localhost:3000
```

(Leave `AUTH_MODE` unset / `basic` with blank `BASIC_AUTH_*` to skip login
locally.)

---

## Environment variables

| Variable | What it's for | Notes |
|---|---|---|
| `DATABASE_URL` | PM-Central's own Postgres | `postgresql://…` (Railway/Neon/Supabase) |
| `AUTH_MODE` | `supabase` (per-user login) or `basic` | **prod: `supabase`** |
| `NEXT_PUBLIC_SUPABASE_URL` | Login + inspection photos project | `https://vpphjzvesgrihqavzyfu.supabase.co` (public) |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Browser login key | the **publishable** key `sb_publishable_…` (public; set as a Config var in Vercel). Legacy JWT keys are disabled. |
| `SUPABASE_SERVICE_KEY` | Inspection photos (Storage) + listing users | same project's **secret** key `sb_secret_…` (server-only) |
| `RENTVINE_BASE_URL` | Balance sync | `https://pmilighthouse.rentvine.com/api/manager` |
| `RENTVINE_API_KEY` / `RENTVINE_API_SECRET` | Balance sync (Basic auth) | server/CLI only |
| `PMS_PROVIDER` | Balance-sync source | `rentvine` (default) |

Search and Invoicing read Neon via Prisma (`DATABASE_URL`) — no Supabase vars.
`INVOICING_SUPABASE_URL` / `INVOICING_SUPABASE_SERVICE_KEY` are only for the
one-off `scripts/migrate-invoices-to-neon.ts`, run locally; don't set them in
Vercel.
| `BASIC_AUTH_USER` / `BASIC_AUTH_PASSWORD` | Only if `AUTH_MODE=basic` | not used in `supabase` mode |
| `TENANT_TURNER_WEBHOOK_SECRET` | Gates the Tenant Turner showings webhook | long random string; set on **both** services. See "Tenant Turner showings" below |
| `FEATURE_*` | Turn modules on/off | all on by default |

`.env.example` documents each of these.

---

## Production deploy (Railway — recommended)

Railway runs the app container, a managed Postgres, and a custom domain, all
from a dashboard. Fly.io and Render work the same way (build the `Dockerfile`,
attach a managed Postgres, set env vars, seed, map the domain).

**Deploy to a staging URL first; point `pmilighthouse.app` at it only after
it checks out.**

1. **https://railway.app → New Project → Deploy from GitHub repo** →
   `pland10/PM-Central`. It builds the `Dockerfile` automatically.
2. **Add a database**: in the project, **New → Database → PostgreSQL**. Railway
   exposes its connection string as `DATABASE_URL` (reference it on the app
   service). (Supabase or Neon Postgres works too — just set `DATABASE_URL`.)
3. **Variables**: set everything from the table above. At minimum:
   - `DATABASE_URL` → the Postgres connection string
   - `AUTH_MODE=supabase`
   - `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `SUPABASE_SERVICE_KEY`
   - `RENTVINE_BASE_URL`, `RENTVINE_API_KEY`, `RENTVINE_API_SECRET`
4. **Seed the data once** — open the service's shell (or a one-off command):
   ```bash
   npm run db:push        # create tables on the volume
   npm run import         # load the real PMI Lighthouse data
   npm run sync:balances  # pull current outstanding balances from Rentvine
   ```
5. **Check the staging URL**: log in (Supabase), then verify Dashboard,
   Properties, Search, Inspections, and Invoicing (create a *draft* invoice,
   print it, delete it in the fallback app). Only proceed once this is clean.

### Scheduling syncs (external scheduler)

The data syncs run as GitHub Actions workflows, but **GitHub's cron is
best-effort and regularly drops scheduled runs** — so scheduling is driven by a
reliable external scheduler that calls an endpoint on the app, which dispatches
the due workflows. (GitHub's own `schedule:` triggers stay in the workflows as a
backstop; runs are idempotent, so an occasional double-trigger is harmless.)

**Endpoint:** `POST /api/cron/sync` — auth via `Authorization: Bearer <CRON_SECRET>`
(or `?key=<CRON_SECRET>` for pingers that can't send headers).
- `?tier=hourly` → communications, payments, emails
- `?tier=daily` → properties, balances
- `?source=<id>` → one source (`properties`, `balances`, `communications`,
  `payments`, `emails`)

**Scheduler: Vercel Cron** (`crons` in `vercel.json`, production deployments
only). Vercel calls the endpoint with `Authorization: Bearer $CRON_SECRET`
automatically when `CRON_SECRET` is set in the project:
- hourly tier — every hour 11–23 UTC (~7am–7pm ET) and every 2h overnight;
- daily tier — 10:20 UTC (~6:20am ET).
The extra `slot=` param only makes the two hourly paths distinct; the route
ignores it. Also needs `GITHUB_DISPATCH_TOKEN` (fine-grained, Actions: write on
PM-Central + leadsimple-search). Sub-daily crons need Vercel **Pro** — on Hobby
the deploy fails, so move to Upstash QStash / cron-job.org (same endpoint) if
the plan ever drops. Check fires in Vercel → project → Settings → Cron Jobs
(logs per run).

### Keeping balances fresh after an import

`npm run import` reloads the snapshot and resets balances, so run
`npm run sync:balances` after any manual import (the scheduled balance sync also
corrects it on its next run).

### Tenant Turner showings (webhook)

Showings come from Tenant Turner, which **pushes** a webhook on each viewing
event (requested / scheduled / confirmed / cancelled / no-show / feedback) plus
lockbox-code-sent. There's no polling sync — the app receives the events and
upserts the `Showing` table.

Setup:

1. Create the `Showing` table on **each** database (dev and prod are separate
   Neon branches). **Do NOT use `npm run db:push` here** — this database also
   holds tables that aren't in `schema.prisma` (`activities`, `payments`,
   `work_orders`, …, written by the leadsimple-search sync), and `db push`
   would try to **drop** them. Instead apply the additive DDL with
   `prisma db execute` (via the Railway CLI so the right `DATABASE_URL` is
   injected):
   ```bash
   railway run npx prisma db execute --file prisma/sql/showings.sql --schema prisma/schema.prisma
   ```
   `prisma/sql/showings.sql` is idempotent (`CREATE TABLE IF NOT EXISTS …`), so
   it's safe to re-run and touches nothing but the `Showing` table.
2. Set **`TENANT_TURNER_WEBHOOK_SECRET`** (a long random string) on both Railway
   services. Tenant Turner does **not** sign its webhooks, so this secret —
   carried in the URL — is what proves a request is really from Tenant Turner.
   *(Changing a Railway variable doesn't redeploy — restart the service so the
   app picks it up.)*
3. In the Tenant Turner portal (**Sign in → Webhooks**), register the receiver
   URL and subscribe to the viewing + lockbox events:
   ```
   https://pmilighthouse.app/api/webhooks/tenantturner?key=<TENANT_TURNER_WEBHOOK_SECRET>
   ```
   (Use the dev service's URL + its own secret to test against dev first.)
4. Verify: open the same URL in a browser — a correct secret returns
   `{"ok":true,...}`; a wrong/missing one returns `401`.

Notes:
- **Forward-only:** webhooks capture showings from the moment they're turned on;
  there's no historical backfill (Tenant Turner's REST list endpoint doesn't
  include the property, so it can't backfill with property attribution anyway).
- Each showing links to one of our properties **by address** (best effort); the
  Tenant Turner address is always stored, so a showing is never dropped even
  when it doesn't match a known property.
- The `TENANT_TURNER_API_KEY` (Actions secret in `leadsimple-search`) is for
  Tenant Turner's REST API and isn't needed by this webhook receiver.

---

## Taking over pmilighthouse.app

The apex domain currently serves the old static pages (`search.html`,
`inspections.html`); PM-Central's native Search and Inspections replace them.

1. In Railway → **Settings → Networking → Custom Domain**, add
   `pmilighthouse.app`. Railway gives a target.
2. At your registrar, point the apex at it. A bare apex needs an **ALIAS/ANAME**
   record (or use a plain `CNAME` on `app.pmilighthouse.app` and stage there
   first). TLS is issued automatically.
3. **Leave the invoicing app up** at `invoicing.pmilighthouse.app` as the
   fallback (it shares the invoicing database, so there's no divergence). Retire
   it once PM-Central invoicing has run smoothly for a while.

---

## Security checklist (before public)

- `AUTH_MODE=supabase` is set (no open app, no shared password).
- Every `*_SERVICE_KEY` and `RENTVINE_API_SECRET` is set **only** as a plain
  server variable — never `NEXT_PUBLIC_*`, never committed.
- `.env` is gitignored (it is); only `.env.example` is in the repo.
- A Supabase backup of the invoicing project exists before the team writes
  invoices through PM-Central.

---

## Recreating it elsewhere later

No host-specific code: any host that builds the `Dockerfile` and can reach a
Postgres works — set the env vars, seed once, map the domain. The strongest
long-term SaaS stack is **Vercel** (the Next.js app) + managed Postgres
(Supabase/Neon); the Dockerfile isn't needed there. Multi-tenancy (isolating
each customer's data) is the remaining product-level work — the schema, the
source-agnostic import, feature flags, and the white-label brand config are
already built for it.
