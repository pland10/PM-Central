# Deploying PM-Central on Vercel (migration off Railway)

PM-Central is a Next.js App Router app. Its database (**Neon**) and auth/storage
(**Supabase**) are external SaaS — they do **not** move. Only the web app moves.
This guide takes it from Railway to Vercel. It's also a clean moment to set
**rotated** secrets (never reuse the ones that were in Railway).

Target execution time: ~20–45 min to a live `*.vercel.app` URL; 1–2 hours for the
full custom-domain cutover including DNS propagation.

---

## 0. Prerequisites

- **Vercel Pro** (~$20/mo). Required, not optional:
  - Vercel **Hobby is non-commercial only** — a property-management business app
    must be on Pro per Vercel's terms.
  - Hobby caps serverless functions at **10s**; the dashboard + Security Deposits
    pages make live Rentvine calls that can exceed that. Pro allows up to 60s
    (already set via `maxDuration = 60` on those routes) / 300s.
- Access to: the **GitHub repo** (`pland10/PM-Central`), the **domain registrar**
  for `pmilighthouse.app`, the **Supabase** dashboard, and the **Neon** console.
- The current **Railway env vars** (Railway dashboard → service → Variables →
  **Raw Editor** lets you copy them all at once). If Railway is unreachable,
  reconstruct from `.env.example` + rotated values.

---

## 1. Import the repo

1. Vercel → **Add New → Project** → import `pland10/PM-Central`.
2. Framework preset: **Next.js** (auto-detected). Leave Build Command (`next build`)
   and Install Command default — `postinstall` already runs `prisma generate`.
3. **Production Branch:** `main` (Settings → Git).
4. Don't deploy yet — set env vars first (next step), or the first build will fail
   auth/db at runtime.

`vercel.json` in the repo pins the region to **iad1** (US-East, closest to the
Neon `us-east-2` database) to keep DB latency low.

---

## 2. Environment variables

Copy **every** variable from the Railway **prod** service into Vercel
(Settings → Environment Variables, scope **Production**). The fastest path is
Railway Raw Editor → paste into Vercel's bulk editor. Then make the changes below.

**The one required change — `DATABASE_URL` must use Neon's POOLED endpoint.**
Railway runs one long-lived container, so a direct Postgres connection is fine.
Vercel is **serverless** (many short-lived function instances) and will exhaust
Neon's connection limit on a direct connection. Use the pooled host + the Prisma
pooling flags:

```
# Direct (what Railway likely uses) — host has NO "-pooler":
postgresql://neondb_owner:PASSWORD@ep-royal-salad-b4hb97y8.us-east-2.aws.neon.tech/neondb?sslmode=require

# Pooled (use THIS on Vercel) — note "-pooler" in the host + pgbouncer flag:
postgresql://neondb_owner:PASSWORD@ep-royal-salad-b4hb97y8-pooler.us-east-2.aws.neon.tech/neondb?sslmode=require&pgbouncer=true&connection_limit=1
```

Get the exact pooled string from **Neon console → your project → Connect →
"Pooled connection"**. (The app only uses the Prisma client at runtime — no
`prisma migrate` at build — so the pooled URL alone is enough; no `directUrl`
needed.)

### Variable checklist

Required (app won't run without these):

- `DATABASE_URL` — Neon prod, **pooled** (see above)
- `NEXT_PUBLIC_SUPABASE_URL` and `SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` and `SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_KEY`
- `AUTH_MODE=supabase`

Integrations (set the ones you use — all were on Railway):

- `RENTVINE_API_KEY`, `RENTVINE_API_SECRET`, `RENTVINE_BASE_URL`
  (`RENTVINE_SUBDOMAIN`, `RENTVINE_ACCOUNT`, `RENTVINE_BALANCE_REPORT_ID` optional)
- `RESEND_API_KEY` (`RESEND_FROM`, `INSPECTION_SUMMARY_TO` optional)
- `INVOICING_SUPABASE_URL`, `INVOICING_SUPABASE_SERVICE_KEY` (invoicing module)
- `TENANT_TURNER_WEBHOOK_SECRET` (showings webhook)
- `CRON_SECRET` (guards `/api/cron/*`)
- `GITHUB_DISPATCH_TOKEN` (admin Data page "Refresh" buttons dispatch workflows)
- `PMS_PROVIDER=rentvine`, `INSPECTIONS_URL`, `RC_OWNER_PERSON_ID` (as used)

Optional / config:

- `APP_ENV`, `SESSION_IDLE_MINUTES`, `INVOICE_NUMBER_START`
- `FEATURE_*` flags (only if you want a module OFF — default is ON)
- `BASIC_AUTH_USER` / `BASIC_AUTH_PASSWORD` — **only** if a service uses
  `AUTH_MODE=basic` (prod is `supabase`, so prod doesn't need these)

> If rotating secrets as part of this move: enter the **new** values here and
> never re-enter the old ones.

---

## 3. Supabase — allow the new URLs

Supabase → **Authentication → URL Configuration**:

- **Site URL:** `https://pmilighthouse.app`
- **Redirect URLs:** add `https://pmilighthouse.app/**` **and** the Vercel preview
  URL `https://<project>.vercel.app/**` (so login works before the domain cutover).

Skip this and logins will fail with a redirect error on the new host.

---

## 4. First deploy + smoke test (on the vercel.app URL)

1. Trigger a deploy (push to `main`, or Vercel → Deploy).
2. Open the `*.vercel.app` URL and verify:
   - **Login** works (Supabase).
   - **Dashboard** loads, incl. the live **Deposits held** tile (proves Neon +
     Rentvine reachable and the 60s timeout is enough).
   - **Inspection photos** render (Supabase Storage via `next/image`).
   - A **Rentvine** action (e.g. open Security Deposits) returns data.

Fix any env/redirect issues here, before touching DNS.

---

## 5. Dev environment

Two clean options:

- **Preview deployments (simplest):** pushes to the `dev` branch auto-build as
  Vercel Previews. Add the **dev** values (Neon *dev* branch, Supabase *dev*) as
  env vars scoped to **Preview**. Each dev push gets a preview URL.
- **Separate Vercel project:** import the same repo again as `pm-central-dev`,
  production branch `dev`, with the dev env vars. Cleaner if you want a stable
  `dev.pmilighthouse.app`.

---

## 6. Custom domain cutover

1. Vercel → Project → **Settings → Domains** → add `pmilighthouse.app`
   (and `www` / `dev` as needed). Vercel shows the exact DNS records.
2. At your **registrar**, point the domain to Vercel:
   - Apex `pmilighthouse.app`: the `A` record Vercel gives (or an ALIAS/ANAME to
     `cname.vercel-dns.com` if your registrar supports it).
   - Subdomains: `CNAME` → `cname.vercel-dns.com`.
3. Wait for DNS propagation + automatic SSL (minutes to a couple hours).
4. Because the domain is unchanged, **external webhooks keep working** once DNS
   moves (Tenant Turner → `/api/webhooks/tenantturner`), and the GitHub Actions
   syncs are unaffected throughout (they run on GitHub, not the host).

---

## 7. Decommission Railway

Once the Vercel deployment serves `pmilighthouse.app` and is verified for a day:

- Remove/scale the Railway services to zero (keep them a day as a rollback).
- **Rotate anything that was ever in Railway** if not already done (the breach).

---

## Verification checklist

- [ ] Login (Supabase) on the live domain
- [ ] Dashboard loads; Deposits held shows the live Rentvine number
- [ ] Properties total, work-order panels render
- [ ] Inspection create + photo upload works (Supabase Storage)
- [ ] Send summary email delivers (Resend)
- [ ] Create-work-order resolves against Rentvine
- [ ] Admin → Data refresh dispatches the workflow (GITHUB_DISPATCH_TOKEN)
- [ ] Nightly syncs (GitHub Actions) still green — unaffected by the move

## Rollback

Point the DNS records back to Railway (and un-pause the Railway service). Nothing
in the app is Vercel-specific except `vercel.json` and the `maxDuration` exports,
both of which are inert on Railway — so the app runs identically on either host.
