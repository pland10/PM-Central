# PM-Central — open items

## Search — native (first pass done); follow-ups
Search is now native in PM-Central: `/search` page + `/api/search` route querying
the synced LeadSimple `activities` table in Supabase (keys server-side, behind
PM-Central auth). Set `SUPABASE_URL` + `SUPABASE_ANON_KEY`.
Ported: full-text search, all 6 types (email/text/call/note/chat/task), direction,
task open/closed, "scope by" contact/property/pipeline with autocomplete, per-page,
pagination, count, and the sync-freshness indicator.
Not yet ported from the standalone app: the contact side-panel, and the
"complete task" action (needs the LeadSimple key wired server-side — the key
currently lives only in the standalone repo's env/HTML).
Bigger picture — "everything hits PM-Central": the data still lives in Supabase,
populated by the standalone repo's Python sync scripts (`pland10/leadsimple-search`).
Full data ownership = port that sync pipeline into PM-Central's own DB later.
Standalone `search.html` is now frozen (PM-Central is the home).


## Invoicing — native read-only (Phase 1 done); writes later
Invoicing is now native in PM-Central: `/invoicing` reads the live invoicing
database directly (server-side) and renders a list + read-only detail drawer —
KPIs (outstanding / paid / collected rate), status filter (draft/sent/paid),
search, sortable columns, per-invoice line items and totals. **Read-only**: the
standalone invoicing app (`pland10/pmi-invoicing`) stays the only writer.

Config: the invoicing app is its own Supabase project (separate from Search).
Its `invoices` table is locked to signed-in users (`... to authenticated`) — on
purpose, since the anon key ships in the public invoicing client — so PM-Central
reads server-side with the project's **service_role** key. Set
`INVOICING_SUPABASE_URL` + `INVOICING_SUPABASE_SERVICE_KEY` (service key stays
server-side, behind Basic Auth; PM-Central only ever SELECTs).

Phase 2 (later, careful): allow edits/create from PM-Central. Prereqs — a DB
backup + a tested fallback to the standalone app, and decide the auth model
(service_role writes are trusted-backend; or sign in a real invoicing user so
`created_by`/`updated_by` stay meaningful). Don't start until Phase 1 has been
in real use for a bit.


## Inspections app — linked now, rebuild later
Done: sidebar "Inspections" tab links out to the separate inspection app
(set `INSPECTIONS_URL` to its deployed URL). The inspection app
(`pland10/PMI-Inspection`) is Flask + Supabase (auth, photo storage) and pulls
properties from Rentvine.

Rebuild-into-PM-Central plan (later): port inspection CRUD + UI to Next.js/Prisma
(the `Inspection` model already exists), then tackle the two hard parts —
per-inspector auth/roles and photo storage (no equivalent in PM-Central yet).
NOTE: the inspection app's data is throwaway except the real metadata — do NOT
migrate inspection records/photos; only carry over the schema/metadata.


## 🚩 Deposits held — data is wrong (revisit later)
The dashboard "Deposits held" KPI sums `Lease.depositBalance`, which currently
comes from Rentvine's Rent Roll `depositBalance` column (total ≈ $10,250). That
column is a **ledger balance, not the security deposits held in trust** — most
active leases show $0 there, which is not the real held amount.

To fix: pull the true per-lease deposit held from Rentvine
(`list_lease_deposit_balances` per lease, ~30 calls, or a deposit/trust report),
store it on the lease, and surface a proper "Deposit held" field on the lease /
tenant / property pages. Flagged 2026-09-29; deferred at the user's request.

## Vacant properties — squatter watch vs. genuinely vacant (needs decision)
These 10 have no active lease in Rentvine and are NOT in Rentvine's
"Squatterwatch Properties" group (only the 5 tagged ones are). Decide per
property whether to tag squatter watch (ideally in Rentvine, then re-sync) or
leave as a real vacancy:
136 West Henrietta (Oceanside) · 54 Pembrook (Stony Brook) ·
2077 Feuereisen (Ronkonkoma) · 6 Harbor Ln (Glen Head) ·
100 West Broadway 4E (Long Beach) · 47 Columbine (Islip) ·
16 Bittersweet (Huntington) · 18-47 26th Rd (Astoria) ·
15 Amys Court (East Hampton) · 13 Beaver Trail (Coram)

## Data quirk — 796 Amboy Avenue (props 79 & 81)
Same address appears twice. Rentvine puts the active lease (Rachel Barnes,
lease 50) on property 81; the bundled snapshot linked it to 79. One shows
occupied and the other vacant. Reconcile when refreshing lease data.
