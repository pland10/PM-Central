---
name: smoke-test
description: Use after a production deploy, a Vercel redeploy, a DNS change, or a secret/env rotation — anything where the user needs to know the live site still works. Splits checks into what the user must do in a browser and what Claude can prove via Actions.
---

# Post-deploy smoke test

Claude's sandbox **cannot reach pmilighthouse.app or *.vercel.app**. So hand the
user a short browser checklist, and run the Actions-side checks yourself
(`verify-sync` skill). Pick only the rows relevant to what changed.

## User checks (browser)
| Check | Proves |
|---|---|
| `https://pmilighthouse.app/api/health` → `{"ok":true,"db":"up"}` and a fresh `time` | app serving, Neon reachable (pooled `DATABASE_URL`), new deploy live |
| Log in at the domain | Supabase auth (`NEXT_PUBLIC_SUPABASE_*`, redirect URLs) |
| Dashboard **Deposits held** shows a number | live Rentvine call within the 60 s limit, Rentvine app creds |
| **Security Deposits** page loads rows | Rentvine report endpoint |
| Open an inspection with photos | Supabase Storage + `SUPABASE_SERVICE_KEY` |
| **Invoicing** list loads | `INVOICING_SUPABASE_*` |
| Admin → Data → Refresh starts a run | `GITHUB_DISPATCH_TOKEN` |
| Complete & send an inspection summary (only if email changed) | `RESEND_API_KEY` |

Ask for the exact output/screenshot when something looks off — a 503 from
`/api/health` means the DB, a login redirect error means Supabase URL config,
an error tile means Rentvine creds or timeout.

## Claude checks (Actions)
- PM-Central `sync-rentvine` → `Synced "pmilighthouse" …` line.
- leadsimple-search `health-check` (`dry_run: "false"`) → `Sent to …` line.

### Retry warnings (surface even on green)
The Rentvine (`sync-rentvine`, `sync-balances`) and Plaid (`sync-plaid`) syncs
retry transient upstream failures (429/5xx/network) with exponential backoff
(`src/lib/http-retry.ts`). Each retry logs a `console.warn` to the Actions log:

```
Rentvine GET /properties HTTP 500 — retrying (attempt 1) in 412ms
Plaid /transactions/sync HTTP 503 — retrying (attempt 2) in 790ms
```

So after reading a sync run's log, also grep it for `retrying (attempt`
(`gh run view <id> --log | grep -i "retrying (attempt"`). A **green** run that
needed retries still points at a flaky upstream — report the count and which
endpoint, don't fold it into "all good". A run that **failed** after exhausting
retries means the outage outlasted the backoff (seconds), not a one-off blip:
re-dispatch, and if it fails again it's a real Rentvine/Plaid outage or a creds
problem, not transient.

## Order
1. `/api/health` first — if the DB is down nothing else is meaningful.
2. Login, then the pages tied to what changed.
3. Actions checks in parallel while the user clicks.

## Report
One line per check with its result. Anything not checked is listed as **not
checked**, never folded into "all good". If a green sync logged any
`retrying (attempt …)` lines, add a line noting the endpoint and retry count —
a pass that needed retries is not the same as a clean pass.
