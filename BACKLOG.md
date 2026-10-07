# PM-Central — backlog

Ideas captured for later. Not scheduled yet; details to be nailed down when we
pick one up.

## Inspection summary emails
When an inspection is completed, send a summary to **info@pmilighthouse.com**.

- Trigger: an inspection moving to a "done/completed" state.
- Delivery: email to info@pmilighthouse.com (channel/format TBD).
- Open questions to settle before building: what goes in the summary (which
  fields, photos, pass/fail items, notes), whether it's one email per
  inspection or a digest, and which inspection source fires it (manual vs.
  synced).

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
