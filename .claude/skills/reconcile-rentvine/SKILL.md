---
name: reconcile-rentvine
description: Use when the user reports the app disagrees with Rentvine (or LeadSimple) — "we see more X than in RV", "shows expired but she renewed", "says pending but we refunded". Decides whether it's our classification bug, a sync gap, or a data issue in the source system before changing any code.
---

# Reconcile the app against Rentvine

Three past cases, three different answers — so **diagnose before fixing**:
- Work-order over-count → **our bug**: open/closed came from a stage-name regex
  while LeadSimple's `closed_at` was ignored.
- Pamela shown expired → **source data slip**: Rentvine left the lease
  `endDate` at the prior term; the renewal record had the real end.
- 25 Thorney "pending refund" → **not a bug**: the refund was post-dated in
  Rentvine; the app was right.

## Steps
1. **Pin one concrete record** from the user's report (name, address, WO #).
   Screenshots from Rentvine count as the spec — read their filters/statuses
   (e.g. "Status (6)" filter = which states RV counts as open).
2. **Pull it from the source** with the Rentvine MCP connector: `find_tenants`
   (with `contact_id` → leases), `get_lease`, `list_lease_renewals`,
   `get_work_order`, `list_work_order_statuses`, `run_report`,
   `list_transactions`. For LeadSimple-sourced data (work orders, activities)
   the source of truth is the `work_orders` / `activities` tables the
   leadsimple-search sync writes — check which columns it already fills
   (`stage_status`, `closed_at`, …) before inventing logic.
3. **Trace the app's path** for that record: which sync wrote it
   (`src/import/**`, leadsimple-search `*_sync.py`), which `src/lib/*` function
   classifies it, which page renders it. `grep` for the field — an unused synced
   column is a strong lead.
4. **Classify** and say which it is, with evidence from both sides:
   - **Our logic** → fix with a failing test first (`tdd` skill).
   - **Sync gap** (field not pulled / wrong endpoint) → `rentvine-api` skill;
     prove with `verify-sync`.
   - **Source data** → no code change; tell the user what to correct in
     Rentvine/LeadSimple (and offer a defensive guard only if it recurs).
   - **Different systems** (LeadSimple ≠ Rentvine sets) → say the numbers may
     never match exactly and offer the bigger re-sourcing option separately.
5. After a fix ships, re-check the **same record** on the live site (user) or in
   the sync log, and quote it.

## Red flags
- Changing code before reproducing the discrepancy on one named record.
- "Fixing" the app to match a source-data mistake.
- Declaring success from a count without re-checking the original record.
