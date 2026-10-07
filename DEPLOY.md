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
| `NEXT_PUBLIC_SUPABASE_URL` | Identity + Search + Inspections project | `https://vpphjzvesgrihqavzyfu.supabase.co` (public) |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Browser login key | the **publishable/anon** key (public) |
| `SUPABASE_URL` / `SUPABASE_ANON_KEY` | Search (`activities` table) | same project; anon key |
| `SUPABASE_SERVICE_KEY` | Inspections data + listing users | same project's **secret** key (server-only) |
| `INVOICING_SUPABASE_URL` | Invoicing project | `https://yzxmckltuhfmyzgoglrr.supabase.co` |
| `INVOICING_SUPABASE_SERVICE_KEY` | Invoicing read/write | invoicing project's **secret** key (server-only) |
| `RENTVINE_BASE_URL` | Balance sync | `https://pmilighthouse.rentvine.com/api/manager` |
| `RENTVINE_API_KEY` / `RENTVINE_API_SECRET` | Balance sync (Basic auth) | server/CLI only |
| `PMS_PROVIDER` | Balance-sync source | `rentvine` (default) |
| `BASIC_AUTH_USER` / `BASIC_AUTH_PASSWORD` | Only if `AUTH_MODE=basic` | not used in `supabase` mode |
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
   - `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_KEY`
   - `INVOICING_SUPABASE_URL`, `INVOICING_SUPABASE_SERVICE_KEY`
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

**Setup:**
1. Set `CRON_SECRET` (a long random string) and `GITHUB_DISPATCH_TOKEN` (a
   fine-grained GitHub token with Actions: write on PM-Central +
   leadsimple-search) in the app's environment.
2. In a managed scheduler with retries + delivery logs — **Upstash QStash**
   recommended (cron-job.org works too) — create two schedules:
   - **Hourly** → `POST https://pmilighthouse.app/api/cron/sync?tier=hourly`
   - **Daily** (early AM) → `POST https://pmilighthouse.app/api/cron/sync?tier=daily`

   Both with header `Authorization: Bearer <CRON_SECRET>`. A managed scheduler
   (vs. GitHub/host cron) gives guaranteed delivery, automatic retries, and a
   log of every fire — none of which plain cron offers.

### Keeping balances fresh after an import

`npm run import` reloads the snapshot and resets balances, so run
`npm run sync:balances` after any manual import (the scheduled balance sync also
corrects it on its next run).

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
