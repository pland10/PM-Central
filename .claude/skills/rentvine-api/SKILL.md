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
| `/reports/rent-roll?exportTypeID=1&…&reportID=<id>` | saved report (balances, default id 27) |
| `/accounting/receipts` | **tenant receipts only**, oldest first. Rows `{ receipt, payment, charge }`; `payment` has `transactionID, achStatusID, settlementID, portfolioID, leaseID, contactID, amount, datePosted, isVoided, returnTransactionID`. Ignores `transactionTypeID`. Used by leadsimple-search `settlement_sync.py`. |
| `/accounting/transactions?transactionTypeID=5` | **owner receipts** (owner contributions), newest first, rows wrap `transaction` (same fields as `payment` above; `leaseID`/`propertyID` null). The filter works here (`transactionTypeIDs=` is ignored). Type ids match the MCP's `list_transactions` list. |
| `/accounting/transactions/{id}` | one transaction, wraps `transaction` |
| `/accounting/settlements[/{id}]` | wraps `settlement` (`settlementDate`, `amount`, `expectedAmount`, `bankAccountGatewaySettlementID`) |

**Known 404s** (don't retry): `/leases/{id}/lease-renewals`, `/leases/{id}/leaseRenewals`,
`/lease-renewals?leaseID=`, `/workorders`, `/work-orders` (use `/maintenance/work-orders`),
`/property-types`, `/propertyTypes`, `/accounting/owner-receipts`,
`/accounting/receipts/owner`, `/accounting/payments`, `/accounting/contributions`.
`/accounting/receipts/{id}` → 400; `/accounting/owner-contributions`,
`/portfolios/{id}/receipts` → 500.

**Still unknown** (BACKLOG.md): property-type name list, property-group membership
(Squatterwatch = group 4).

## Data quirks
- `primaryLeaseStatusID`: `"2"` Active, `"1"` Pending, `"6"` Closed.
- After a renewal, a lease's own `endDate` can stay at the **prior** term's end —
  even before its `startDate`. The renewal record's `endDate` is authoritative;
  the core sync corrects it and logs `[renewal] lease <id>: end A -> B`.
- Reports split deposits into manager-held (`heldSecurityDepositBalance`) vs
  owner-held; the report total adds both and overstates PMI's trust liability.

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
