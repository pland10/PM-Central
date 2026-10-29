import {
  isPlaidConfigured,
  plaidBaseUrl,
  plaidPost,
  syncTransactions,
  normalizeTransaction,
} from "../src/lib/plaid";

// Headless end-to-end check of the Plaid pipeline against the SANDBOX API —
// no browser (Plaid Link) and no database writes. Proves credentials work and
// the sync + normalization produce sensible rows:
//
//   npm run plaid:sandbox-test
//
// Steps: create a sandbox public token for a test institution → exchange it for
// an access token → /transactions/sync → normalize → print a sample. The access
// token is ephemeral (never stored). Requires PLAID_CLIENT_ID / PLAID_SECRET and
// PLAID_ENV=sandbox.

const SANDBOX_INSTITUTION = process.env.PLAID_SANDBOX_INSTITUTION || "ins_109508";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function main() {
  if (!isPlaidConfigured()) {
    console.error("Plaid not configured — set PLAID_CLIENT_ID / PLAID_SECRET.");
    process.exit(1);
  }
  const env = (process.env.PLAID_ENV || "sandbox").toLowerCase();
  if (env !== "sandbox") {
    console.error(`Refusing to run the sandbox test against PLAID_ENV=${env}. Set PLAID_ENV=sandbox.`);
    process.exit(1);
  }
  console.log(`Plaid sandbox test → ${plaidBaseUrl()} (institution ${SANDBOX_INSTITUTION})`);

  const { public_token } = await plaidPost<{ public_token: string }>("/sandbox/public_token/create", {
    institution_id: SANDBOX_INSTITUTION,
    initial_products: ["transactions"],
  });
  const { access_token, item_id } = await plaidPost<{ access_token: string; item_id: string }>(
    "/item/public_token/exchange",
    { public_token }
  );
  console.log(`Linked sandbox item ${item_id}.`);

  // Transactions can take a moment to be ready right after item creation.
  let result: Awaited<ReturnType<typeof syncTransactions>> | null = null;
  for (let attempt = 1; attempt <= 12; attempt++) {
    try {
      result = await syncTransactions(access_token, "");
      break;
    } catch (e) {
      if (e instanceof Error && e.message.includes("PRODUCT_NOT_READY")) {
        console.log(`  transactions not ready yet, retrying (${attempt})…`);
        await sleep(2000);
        continue;
      }
      throw e;
    }
  }
  if (!result) {
    console.error("Transactions never became ready in sandbox.");
    process.exit(1);
  }

  const { accounts } = await plaidPost<{
    accounts: { account_id: string; name?: string; official_name?: string }[];
  }>("/accounts/get", { access_token });
  const names = Object.fromEntries(
    (accounts || []).map((a) => [a.account_id, a.official_name || a.name || a.account_id])
  );

  const rows = result.added.map((t) => normalizeTransaction(t, names));
  console.log(`Pulled ${rows.length} transaction(s) via /transactions/sync.`);
  for (const r of rows.slice(0, 8)) {
    console.log(
      `  ${r.postedDate}  ${r.amount.toFixed(2).padStart(10)}  ${r.accountName} — ${r.merchantName} [${r.category}]`
    );
  }
  console.log("Dry run — nothing written to the database. Pipeline OK.");
}

main().catch((e) => {
  console.error("\nSandbox test failed:", e instanceof Error ? e.message : e);
  process.exit(1);
});
