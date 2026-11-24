# PM-Central — backlog

Ideas captured for later. Not scheduled yet; details to be nailed down when we
pick one up.

## One-time auto-archive of old bank transactions (through 2026-09-28)
On the Accounting → Bank Transactions tab, archive everything from the beginning
through **Sept 28, 2026** in one pass, to clear out the historical backlog.

- Likely a one-time admin action (button or script) over
  `plaid_transactions` with `posted_date <= 2026-09-28`.
- Open question to settle before building: does it archive **only** rows already
  recorded in both QuickBooks and Rentvine (same guard as the per-row and
  "Archive all recorded" actions), or **everything** through that date
  regardless of recorded status? The current archive paths all require
  both-recorded; a blanket date archive would need its own code path.
- Reversible either way — archived rows stay reviewable under the Archived
  filter and can be unarchived.

## Inspection summary emails
When an inspection is completed, send a summary to **info@pmilighthouse.com**.

- Trigger: an inspection moving to a "done/completed" state.
- Delivery: email to info@pmilighthouse.com (channel/format TBD).
- Open questions to settle before building: what goes in the summary (which
  fields, photos, pass/fail items, notes), whether it's one email per
  inspection or a digest, and which inspection source fires it (manual vs.
  synced).

## Property type names in the live sync
On the Properties page, most property types show correctly as "single family"
but some appear as raw numbers. The live sync (`liveRentvineSource` in
`src/import/sources/rentvine/client.ts`) only hard-codes propertyTypeID 1 =
"Single Family Home" and tries to fetch the full type list from
`/property-types` / `/propertyTypes` — both of which appear unavailable on this
account, so other type IDs fall through as the raw number.

Fix: find the correct Rentvine endpoint for the property-type list, or fill in
the `PROPERTY_TYPE_NAMES` map (ID → name) with the account's actual type IDs.
The transform's `RV_TYPE` table then maps the names to our slugs.

## Property-group tags + work orders in the live sync
The live Rentvine core sync (`scripts/sync-rentvine.ts`) currently refreshes
properties/units/owners/leases/tenants and deliberately leaves work orders and
property-group tags alone (it preserves whatever is already there). Follow-up:
sync those too.

- Property groups → tags: group **Squatterwatch Properties** = group ID 4
  (from `list_property_groups`). Need the REST endpoint for group membership so
  the sync can set `tags` (e.g. `squatterwatch`) per property.
- Work orders: `/workorders` and `/work-orders` both 404 on the Manager REST
  API — the correct endpoint still needs to be found before WO sync can be
  built. Until then the WO records loaded from the original snapshot are
  preserved by the sync.

## Preventive maintenance on the Maintenance page
Let the Maintenance page tell preventive work (e.g. HVAC tune-ups) apart from
reactive repairs, with a **Preventive / Reactive** filter and, likely,
preventive items left out of the attention list by default (decide when
picked up).

Findings (Oct 2026): no recurring work orders are set up in Rentvine; the 19
HVAC tune-ups were created by hand with free-text titles ("HVAC Tuneup",
"HVAC tune up", "HVAC tuneup"). Rentvine work orders already carry
`workOrderTypeID` and `recurringWorkOrderID` (unused so far).

Recommended source of truth — **Rentvine**, not LeadSimple or our DB:
1. Add a work order type "Preventive Maintenance" (Rentvine Settings →
   Maintenance → Work Order Types) and pick it on tune-ups.
2. Better: set seasonal jobs up as Rentvine **recurring work orders**; every WO
   they create has `recurringWorkOrderID`, so it's preventive with no data
   entry.
3. App side: `sync-rentvine-work-orders` stores the type + recurring link in
   `rv_work_orders` (additive columns); `WorkOrderRow` gets `preventive`;
   Maintenance gets the filter. Title fallback (`/tune[- ]?up/i`, etc.) so
   existing tune-ups are tagged until the type is used consistently.

## Owner Draws follow-ups (Accounting → Owner Draws)
Shipped Nov 24, 2026 (v1.0.448). Waiting on the team to settle the process
before picking these up.

- **Paid ticks itself from Rentvine.** Use the "Owner Payments" report (route
  `owner-payments`) to mark a row paid when the owner payment posts, instead of
  the manual checkbox. **On hold until the user decides the draw process.**
- **Past months hide unapproved rows.** `buildDrawRows` only lists rows with a
  snapshot (approved/paid) when there's no live data, so notes and edits on a
  past month's unapproved rows don't show. List them too.
- **Rows vanish when a portfolio leaves Rentvine.** A saved row (notes/edits)
  whose portfolio drops out of the Portfolio Balances report mid-month isn't
  shown. Show it with a "not in Rentvine" marker.
- **Import history (last).** Bring in the last month or two from the Owner
  Draws spreadsheet, only if still useful. User: "that should be the last
  thing we work on."
