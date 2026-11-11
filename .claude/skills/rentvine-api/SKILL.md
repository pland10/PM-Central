---
name: rentvine-api
description: Use before writing or debugging any code that calls the Rentvine Manager REST API (src/import/sources/rentvine, src/lib/security-deposits.ts, balances, work orders), or when a needed Rentvine endpoint is unknown. Records verified endpoint shapes, data quirks, and the probe-and-log method for discovering endpoints.
---

# Rentvine Manager REST API — what we know

Base `https://<subdomain>.rentvine.com/api/manager` (`RENTVINE_BASE_URL`),
HTTP Basic `apiKey:apiSecret`. Helpers: `rvHttp()` in
`src/import/sources/rentvine/client.ts` (`rvGet`, `rvGetAll`, `unwrap`).

## Response shape rules
- Lists are bare arrays; **each row wraps its record under a singular key**:
  `{ property: {…} }`, `{ lease: {…}, unit: {…} }`. Use `unwrap(row, key)`.
- **Every value is a string**: `"1"`, `"0.00"`, ids too. Compare with
  `toStr(x) === "2"`, convert money with `Number(...)`.
- Pagination: `?page=N`; total in the `Pagination-Total-Pages` header (`rvGetAll` handles it).

## Verified endpoints
| Path | Notes |
|---|---|
| `/properties`, `/portfolios`, `/leases` | wraps `property` / `portfolio` / `lease`+`unit` |
| `/leases/{id}/tenants` | rows `{ leaseTenant: {isPrimary}, contact: {name,email,phone} }` |
| `/leases/{id}/renewals` | **ignores `{id}` — returns the whole renewals collection.** Rows `{ renewal: { leaseID, startDate, endDate, previousStartDate, previousEndDate, leaseRenewalStatusID } }`. Fetch once, index by `leaseID`. |
| `/maintenance/work-orders` | wraps `workOrder`; `priorityID` 1/2/3 = Low/Medium/High |
| `/reports/<route>?exportTypeID=1&json=<urlencoded {displayColumns, orderBys, filters}>` | `{ rows: [{rowTypeID, data}] }` — `3` = data row, `4` = totals |
| `/reports/rent-roll?exportTypeID=1&…&reportID=<id>` | saved report (report-type 63), rows `{ rowTypeID, data }` (3 = data, 4 = totals); `data` has `leaseID`, `expectedMonthlyRentAmount`, `balanceDue`, `depositBalance`, dates. **id 27** = Outstanding Balance (balances sync reads `balanceDue`); **id 10** = Rent Roll (core sync reads `expectedMonthlyRentAmount` for current rent). Amounts may be `"$4,100.00"`-formatted — strip `[$,]`. Find ids via `list_saved_reports`. |
| `/accounting/receipts` | **tenant receipts only**, oldest first. Rows `{ receipt, payment, charge }`; `payment` has `transactionID, achStatusID, settlementID, portfolioID, leaseID, contactID, amount, datePosted, isVoided, returnTransactionID`. Ignores `transactionTypeID`. Used by leadsimple-search `settlement_sync.py`. |
| `/accounting/transactions?transactionTypeID=5` | **owner receipts** (owner contributions), newest first, rows wrap `transaction` (same fields as `payment` above; `leaseID`/`propertyID` null). The filter works here (`transactionTypeIDs=` is ignored). Type ids match the MCP's `list_transactions` list. |
| `/accounting/transactions/{id}` | one transaction, wraps `transaction` |
| `/maintenance/work-orders` (fields) | `workOrder` also carries `estimatedAmount`, `dateDue`, `dateClosed`, `scheduledStartDate`/`actualEndDate`; a `contact` (vendor) wrapper rides along. Oct 2026: 52 of 482 WOs had an estimatedAmount, only 1 open one. |
| `POST /maintenance/work-orders` | the app's one Rentvine **write**: JSON `{ propertyID, workOrderStatusID, priorityID, description, unitID? }` (`src/lib/inspections/rentvine-wo.ts`, used by inspection resolve and Maintenance → "+ New work order"). Defaults: status 4 Requested, priority 2 Medium. Never retried (a retry could double-create). Response unwrapped from `workOrder` for `workOrderID` / `workOrderNumber`. A WO created in Rentvine only appears on Maintenance once LeadSimple has a process for it. |
| `/accounting/bills` | wraps `bill` (+ `contact`). Has `workOrderID` (325 of 2874 bills; 374 voided) but **no amount field** — the total is the sum of the bill's charges (MCP `get_bill` with `charges`). Per-WO billed cost needs a per-bill charges fetch. |
| `/properties/units` | **all units**, paged (3 pages of up to 20 rows, Oct 2026), rows wrap `unit` (+ `token`): `unitID, propertyID, name` ("Unit 1"), `isActive`, `dateTimeDeactivated`, `address2`, `rent`, `deposit`, `beds`, `fullBaths`, `leaseID`, … Also `/properties/{id}/units` and `/properties/units?propertyID=` (one property). `/units` → 404. Synced to raw `rentvine_units` by the core sync (`fetchRentvineUnits`). |
| `/properties/groups` | all property groups (1 page, 6 rows, Nov 2026), rows wrap `propertyGroup` {`propertyGroupID`, `name`}; `/properties/groups/{id}` = one. Group 4 = "Squatterwatch Properties" → `squatterwatch` tag via `groupTag`. |
| `/properties/{id}/groups` | one property's membership, rows wrap `groupProperty` {`groupPropertyID`, `propertyGroupID`, `propertyID`}. The core sync calls it per property (`groupsByProperty`). `/properties?propertyGroupID=` / `propertyGroupIDs=` / `groupID=` return 200 but **ignore the filter**; `/properties/groups/{id}/properties` and `propertyGroupIDs[]=` → 500; `/property-groups`, `/propertyGroups` → 404. `/properties/{id}?includes=groups` adds nothing. |
| `/accounting/transactions?transactionTypeID=7` | **bill lines** ("Bill Charge", one per line, posted to the owner's ledger). ~270 pages of 15 (Nov 2026). Rows wrap `transaction`: `transactionID, billID, propertyID, unitID, portfolioID, amount, datePosted, description, isVoided, markupAmount, chargeAccountID`; `contactID`/`leaseID`/`workOrderID` empty. Synced to raw `rv_bill_charges` (`fetchRentvineBillLines`, `scripts/sync-rentvine-bills.ts`) for the Accounting "Billed in Rentvine" column; reads only the recent pages (`fetchRecent`). |
| `/accounting/bills/{id}?includes=charges` | `{ bill, charges[] }`; each charge wraps `ledger, payeeLedger, portfolio, postingSetting, property, restricted, transaction, unit`. `bill` has `payeeContactID, billTypeID` (1 Standard, 2 Manager = markup bill), `reference, billDate, dateDue, isVoided, markupPercent, propertyID, workOrderID`. `/accounting/bills` rows wrap `bill` + `contact` (payee `name`). Reimbursable card charges are billed to payee **PMI Lighthouse Reimbursable** (contact 503) at cost; the markup is a separate Manager bill to **PMI Lighthouse** (contact 1). |
| `/properties/{id}` | wraps `property`; has `isMultiUnit`, `portfolioID`, `propertyTypeID`, `maintenanceLimitAmount`, `markupPercent`, … |
| `/accounting/settlements[/{id}]` | wraps `settlement` (`settlementDate`, `amount`, `expectedAmount`, `bankAccountGatewaySettlementID`) |

**Known 404s** (don't retry): `/accounting/transactions/entries`, `/accounting/entries`,
`/accounting/transaction-entries`, `/accounting/bills/{id}/charges`, `/units`, `/leases/{id}/lease-renewals`, `/leases/{id}/leaseRenewals`,
`/lease-renewals?leaseID=`, `/workorders`, `/work-orders` (use `/maintenance/work-orders`),
`/property-types`, `/propertyTypes`, `/accounting/owner-receipts`,
`/accounting/receipts/owner`, `/accounting/payments`, `/accounting/contributions`.
`/accounting/receipts/{id}` → 400; `/accounting/owner-contributions`,
`/portfolios/{id}/receipts` → 500.
`/maintenance/work-order-estimates`, `/maintenance/estimates` → 404 (estimates are
MCP-only so far; the account had just 11, so the team tracks estimates by
LeadSimple stage — "Estimate Requested" / "Multiple Estimates" — instead).

**Still unknown** (BACKLOG.md): property-type name list, property-group membership
(Squatterwatch = group 4).

## Data quirks
- The app's Prisma `Unit` rows are **placeholders** built from active leases
  (numbered 1..n), not Rentvine units. Real units live in `rentvine_units`.
- `primaryLeaseStatusID`: `"2"` Active, `"1"` Pending, `"6"` Closed.
- After a renewal, a lease's own `endDate` can stay at the **prior** term's end —
  even before its `startDate`. The renewal record's `endDate` is authoritative;
  the core sync corrects it and logs `[renewal] lease <id>: end A -> B`.
- **Current monthly rent is NOT on the lease or unit object.** The `/leases` row
  has no rent field at all, and the embedded `unit.rent` is a *listing* figure
  that lags after a renewal (5 Ring Ln / lease 6: unit stuck at $3900 while the
  real rent was $4100). The live rent is the Rent Roll report's
  `expectedMonthlyRentAmount` (= the recurring Rent charge). The core sync reads
  it via `loadRentByLease()` (report id `RENTVINE_RENT_ROLL_REPORT_ID`, default
  10), keyed by `leaseID`, and only falls back to `unit.rent`. Confirmed by
  probing lease 6's raw fields — don't trust `unit.rent` for rent.
- Reports split deposits into manager-held (`heldSecurityDepositBalance`) vs
  owner-held; the report total adds both and overstates PMI's trust liability.
- Work order **assignee ≠ vendor**. The *assignee* is the internal staff member
  who owns the WO (a Rentvine **user**/login at PMI, e.g. Jasper Jed Belen) and
  drives it: assignment → approvals → scheduling → work → billing. The *vendor*
  is the outside contractor who does the physical work (the `contact` wrapper on
  `/maintenance/work-orders`); it's separate and can be empty ("No vendor
  assigned yet") while an assignee is set. "Resolved by Agent" is a third thing —
  whether Rentvine's Cru AI closed the WO vs a person. None of these is the
  **LeadSimple** assignee/stage: the two systems track WO ownership
  independently and can disagree (see the "closed in Rentvine, open in
  LeadSimple" mismatch and the `reconcile-rentvine` skill).

## Keys
Rentvine has **one API key per integration** (Settings → API Keys). The
`PM-Central` key is used by the app (Vercel) and PM-Central Actions — and, until
Oct 2026, leadsimple-search too: regenerating its secret on Oct 23 broke the
leadsimple-search Rentvine steps (401) until that repo got its own key. The
`Lead Simple` key is probably LeadSimple's own Rentvine integration — don't
regenerate it. "New API Secret" regenerates the secret only; the key id stays.
Before regenerating any secret, list every repo/env that holds it. The Rentvine
**MCP connector** uses separate auth — unaffected by any of these.

## Discovering an unknown endpoint (probe-and-log)
Guessing a path and silently falling back is how the renewal fix failed once.
1. **See the real data first** with the MCP connector (`list_lease_renewals`,
   `get_lease`, `find_tenants` with `contact_id`, `run_report`,
   `list_property_groups`) — learn field names and a record to check against.
2. Write the sync code to **try several candidate paths**, normalize body shape,
   and **log the first 200's raw body** (`JSON.stringify(json).slice(0, 800)`),
   but only for records that look wrong, to limit log noise/PII.
3. Dispatch the sync against the feature branch (`verify-sync` skill) and read
   the log: which path 200'd, the wrapper key, the field names.
4. Rewrite to the one real path/shape, remove the probe, keep one audit log
   line per correction, re-run, quote the proving line. Then update this file.
