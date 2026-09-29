# Deploying PM-Central

This is a standard Next.js app with a login gate, using SQLite for storage. It
is deliberately **not tied to any one host** — it ships a `Dockerfile`, so the
same image runs on Railway, Render, Fly, or your own server.

> **Before it's public:** the app contains real tenant data (names, emails,
> phones, balances). Never expose it without the login gate — set
> `BASIC_AUTH_USER` and `BASIC_AUTH_PASSWORD` on the host. With those unset the
> app runs open, which is fine on your laptop but not online.

---

## Local development (nothing to install)

SQLite is a plain file — no database server needed.

```bash
npm install
npm run db:push      # create the tables (creates prisma/dev.db)
npm run db:seed      # load the PMI Lighthouse sample data
npm run dev          # http://localhost:3000
```

(Leave `BASIC_AUTH_*` blank locally to skip the login.)

---

## Deploy so others can see it

Because SQLite is a file, the one requirement is a host that gives the app a
**persistent disk** (a "volume") to keep that file across restarts. That rules
out serverless hosts like Vercel; use a container host instead. Railway is the
simplest with clicks + a custom domain:

### Railway (recommended)
1. https://railway.app → **New Project → Deploy from GitHub repo** →
   `pland10/PM-Central` (branch `claude/gracious-meitner-4rfwkk`). It builds the
   `Dockerfile` automatically.
2. On the service → **Variables**, set:
   - `DATABASE_URL` = `file:/data/prod.db`
   - `BASIC_AUTH_USER` = a username you choose
   - `BASIC_AUTH_PASSWORD` = a strong password
3. On the service → **Settings → Volumes**, add a volume mounted at `/data`.
   That's where the SQLite file lives, so data survives redeploys.
4. Seed the database once: open the service's **shell** (or a one-off command)
   and run `npm run db:push && npm run db:seed`.
5. **Settings → Networking → Custom Domain** → add `pmilighthouse.app`. Railway
   gives you a CNAME target; add it at your registrar (for the bare apex domain
   use an ALIAS/ANAME record, or point `app.pmilighthouse.app` with a plain
   CNAME).

**Fly.io** and **Render** work the same way — build the `Dockerfile`, attach a
volume mounted at `/data`, set the three env vars, seed once, map the domain.

---

## Recreating it elsewhere later

Everything a new host needs:
1. This repo (it has the `Dockerfile`).
2. A volume mounted at `/data`, and `DATABASE_URL=file:/data/prod.db`.
3. `BASIC_AUTH_USER` + `BASIC_AUTH_PASSWORD`.
4. `npm run db:push && npm run db:seed` once.

No host-specific code. If you ever outgrow SQLite (e.g. selling to many
companies), switch the one `provider` line in `prisma/schema.prisma` to
`postgresql`, point `DATABASE_URL` at a managed Postgres, and everything else
stays the same.
