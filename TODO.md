# PM-Central — open items

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
