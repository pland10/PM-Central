---
name: rentvine-report-page
description: Use when building a page, tile, or API route that shows live figures from a Rentvine report (deposits, balances, rent roll, owner statements — "pull X live from Rentvine", "show the actual RV number"). Template based on the Security Deposits page.
---

# Live Rentvine report → page

Reference implementation: `src/lib/security-deposits.ts` +
`src/app/(app)/security-deposits/page.tsx` (+ the dashboard Deposits tile).

## 1. Find the report and its columns
With the Rentvine MCP connector: `list_report_types` → pick the type and its
**route** (e.g. `lease-security-deposit-balance`), `get_report_meta` → exact
column names, `run_report` → real rows to sanity-check. Note numbers come back
as strings (`"0.00"`).

## 2. Loader in `src/lib/<thing>.ts` (server-only)
- Return a **discriminated union**:
  `{ ok: true; rows; summary; asOf } | { ok: false; status; error }` — the
  page renders the error state; never throw to the page.
- `isRentvineConfigured()` guard → `{ ok:false, status:503 }` when creds missing.
- URL: `${baseUrl()}/reports/<route>?exportTypeID=1&json=${encodeURIComponent(JSON.stringify({ displayColumns, orderBys, filters }))}`.
- `fetch(url, { headers: { Accept, Authorization: Basic … }, cache: "no-store" })`.
- Keep only `rowTypeID === 3` rows (data); `4` is the totals row.
- Parse money with a tolerant `money()` (strip non-numeric); `str()` for text.
- Put the **business classification** in small pure functions (like
  `isMovedOut`, holder = owner vs PMI) — these are what the tests target.
- Summaries must reflect PMI's real exposure, not the raw report total, when
  the report mixes in owner-held or inactive amounts. Show both if useful.

## 3. Page / route
- `export const dynamic = "force-dynamic"` and **`export const maxDuration = 60`**
  (Vercel serverless; Rentvine reports can take >10 s).
- Render: summary stat tiles, table, `asOf`, and a clear error box for `ok:false`.
- Dashboard tile: reuse the loader inside the page's `Promise.all`, with a
  fallback to configured data if the live call fails.
- Add the page to the nav under the right section (Property Data, etc.).

## 4. Test + verify
- Unit-test classification + summary math with a fixture of report rows
  (include string numbers, a totals row, zero rows, moved-out/owner-held cases)
  and a mocked `fetch` for the error branches — `tdd` skill.
- After deploy: `smoke-test` (user opens the page; compare one row to Rentvine).
