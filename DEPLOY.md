# Deploying PM-Central

This app is a standard Next.js app backed by Postgres, with a login gate. It is
deliberately **not tied to any one host** — the same code runs on Vercel,
Railway, Render, Fly, or your own server. Pick a path below.

> **Before it's public:** the app contains real tenant data (names, emails,
> phones, balances). Never expose it without the login gate. That means setting
> `BASIC_AUTH_USER` and `BASIC_AUTH_PASSWORD` on the host (see step in each
> path). With those unset the app runs open — fine on your laptop, not online.

---

## What you need

- The database is **Postgres** (both locally and in production).
- A **login** is enforced by two env vars: `BASIC_AUTH_USER` + `BASIC_AUTH_PASSWORD`.
- The domain is **pmilighthouse.app** (you own it and can edit DNS).

---

## Local development (one-time switch to Postgres)

You have two options for a local database — pick one.

**Option A — Docker (one command):**
```bash
docker compose up -d db
```
This runs Postgres locally. Your `.env` should have:
```
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/pmcentral?schema=public"
```

**Option B — free hosted Postgres (no Docker):**
Create a free database at https://neon.tech, copy its connection string into
`.env` as `DATABASE_URL`.

Then, with either option:
```bash
npm install
npm run db:push     # create the tables
npm run db:seed     # load the PMI Lighthouse sample data
npm run dev
```
(Locally you can leave `BASIC_AUTH_*` blank to skip the login.)

---

## Path 1 — Vercel + Neon (recommended: easiest, free, custom domain built in)

### 1. Create the production database (Neon)
1. Go to https://neon.tech → create a project.
2. Copy the **pooled** connection string (it includes `-pooler`). This is your
   production `DATABASE_URL`.

### 2. Load the schema + data into it (from your machine, once)
Temporarily point your local `.env` `DATABASE_URL` at the Neon string, then:
```bash
npm run db:push
npm run db:seed
```
(Set it back to your local DB afterward if you like.)

### 3. Deploy the code
1. Go to https://vercel.com → **Add New → Project** → import
   `pland10/pm-central`, branch `claude/gracious-meitner-4rfwkk`.
2. Under **Environment Variables**, add:
   - `DATABASE_URL` = the Neon pooled string
   - `BASIC_AUTH_USER` = a username you choose
   - `BASIC_AUTH_PASSWORD` = a strong password you choose
3. **Deploy.** Vercel builds it and gives you a `*.vercel.app` URL. Open it —
   you should get a login prompt, then the dashboard.

### 4. Point pmilighthouse.app at it
1. In the Vercel project → **Settings → Domains** → add `pmilighthouse.app`
   (and optionally `www.pmilighthouse.app`).
2. Vercel shows the exact DNS records to add. At your domain registrar's DNS:
   - **Apex** `pmilighthouse.app` → an **A** record to the IP Vercel shows
     (currently `76.76.21.21`).
   - **www** → a **CNAME** to `cname.vercel-dns.com`.
   Use whatever Vercel displays — it's authoritative.
3. DNS takes a few minutes to a few hours. Vercel auto-issues HTTPS once it
   sees the records.

---

## Path 2 — Docker anywhere (Railway / Render / Fly / your own server)

The repo ships a `Dockerfile`, so any container host works the same way.

**Railway (clicks, managed Postgres):**
1. https://railway.app → **New Project → Deploy from GitHub repo** →
   `pland10/pm-central`.
2. **New → Database → PostgreSQL.** Railway injects a `DATABASE_URL`.
3. On the app service → **Variables**, add `BASIC_AUTH_USER` and
   `BASIC_AUTH_PASSWORD` (Railway already set `DATABASE_URL`).
4. Load the data once: point your local `.env` `DATABASE_URL` at Railway's
   Postgres (copy it from the DB service's Connect tab), then
   `npm run db:push && npm run db:seed`.
5. App service → **Settings → Networking → Custom Domain** → add
   `pmilighthouse.app`. Railway gives you a **CNAME** target; add it at your
   registrar (apex domains may need an ALIAS/ANAME record, or use
   `app.pmilighthouse.app` as a plain CNAME).

**Render / Fly / a VPS:** same idea — build the `Dockerfile`, attach a Postgres,
set the three env vars, run `db:push` + `db:seed` once against that Postgres,
then map the domain. Because it's just Docker + Postgres + env vars, you can
move between any of these hosts without code changes.

---

## Recreating it elsewhere later

Everything a new host needs:
1. This repo.
2. A Postgres database → set `DATABASE_URL`.
3. `BASIC_AUTH_USER` + `BASIC_AUTH_PASSWORD`.
4. `npm run db:push && npm run db:seed` once against that database.
5. Build (`npm run build` / `npm start`) or run the `Dockerfile`.

No host-specific code, no lock-in.
