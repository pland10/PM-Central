// One-time probe: dumps the raw JSON shape of the Rentvine API records we need,
// so the live sync (liveRentvineSource) can map exact field names instead of
// guessing. Read-only. Run via the rentvine-probe.yml workflow, then paste the
// output back so the real extractor can be finalized. Delete after.
//
// Uses the same creds/base as the balance sync: RENTVINE_BASE_URL (…/api/manager),
// RENTVINE_API_KEY, RENTVINE_API_SECRET.

const base = (process.env.RENTVINE_BASE_URL || "").replace(/\/+$/, "");
const key = process.env.RENTVINE_API_KEY || "";
const secret = process.env.RENTVINE_API_SECRET || "";

if (!base || !key || !secret) {
  console.error("Missing RENTVINE_BASE_URL / RENTVINE_API_KEY / RENTVINE_API_SECRET");
  process.exit(1);
}
const auth = Buffer.from(`${key}:${secret}`).toString("base64");

async function probe(path: string): Promise<unknown | null> {
  try {
    const res = await fetch(base + path, {
      headers: { Accept: "application/json", Authorization: `Basic ${auth}` },
    });
    console.log(`\n===== ${path}  ->  HTTP ${res.status} =====`);
    if (!res.ok) {
      console.log((await res.text()).slice(0, 200));
      return null;
    }
    const json = await res.json();
    const first = Array.isArray(json) ? json[0] : json;
    console.log(JSON.stringify(first, null, 2));
    return first;
  } catch (e) {
    console.log(`\n===== ${path}  ->  ERROR ${e instanceof Error ? e.message : e} =====`);
    return null;
  }
}

function deepFind(obj: unknown, keyRe: RegExp): number | string | null {
  if (!obj || typeof obj !== "object") return null;
  for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
    if (keyRe.test(k) && (typeof v === "number" || typeof v === "string")) return v;
    if (v && typeof v === "object") {
      const inner = deepFind(v, keyRe);
      if (inner != null) return inner;
    }
  }
  return null;
}

async function main() {
  console.log(`Base: ${base}`);

  const propRow = await probe("/properties?page=1");
  const leaseRow = await probe("/leases?page=1");
  await probe("/portfolios?page=1");

  // Work-order endpoint name is uncertain — try the common spellings.
  await probe("/workorders?page=1");
  await probe("/work-orders?page=1");

  // Tenant link for the first lease — try the common shapes.
  const leaseId = deepFind(leaseRow, /^leaseID$/i);
  if (leaseId != null) {
    await probe(`/leases/${leaseId}/tenants`);
    await probe(`/leases/${leaseId}`);
    await probe(`/leaseTenants?leaseID=${leaseId}`);
  } else {
    console.log("\n(could not find leaseID in the first lease row — skipping tenant probes)");
  }

  // A single contact, to confirm name/email/phone fields.
  const contactId =
    deepFind(leaseRow, /contactID/i) ?? (await probe("/contacts?page=1"), null);
  if (contactId != null) await probe(`/contacts/${contactId}`);

  // Units, in case leases don't carry rent/address directly.
  await probe("/units?page=1");

  void propRow;
  console.log("\n=== probe done ===");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
