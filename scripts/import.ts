import { PrismaClient } from "@prisma/client";
import { rentvineToCanonical } from "../src/import/sources/rentvine/transform";
import { pmilighthouse } from "../src/import/sources/rentvine/accounts/pmilighthouse";
import { staticSource, type RentvineExport } from "../src/import/sources/rentvine/raw";
import { loadCanonical } from "../src/import/load";

// Import pipeline entry point:  extract (from a PMS) -> transform -> load.
//
//   npm run import                # imports the default account (pmilighthouse)
//   npm run import -- <account>   # imports a specific account
//
// Registry of known Rentvine accounts. Onboarding another company using Rentvine
// = add its bundled snapshot here, or swap staticSource() for
// liveRentvineSource(accountConfigFromEnv(account)) once its API creds are set.
const RENTVINE_ACCOUNTS: Record<string, RentvineExport> = {
  pmilighthouse,
};

async function main() {
  const account = process.argv[2] ?? "pmilighthouse";
  const data = RENTVINE_ACCOUNTS[account];
  if (!data) {
    console.error(
      `Unknown account "${account}". Known: ${Object.keys(RENTVINE_ACCOUNTS).join(", ")}`
    );
    process.exit(1);
  }

  const prisma = new PrismaClient();
  try {
    const source = staticSource(data); // swap for liveRentvineSource(...) when live
    const raw = await source.extract(); // 1. extract from Rentvine
    const dataset = rentvineToCanonical(raw); // 2. transform -> canonical
    const counts = await loadCanonical(prisma, dataset, { fresh: true }); // 3. generic load
    console.log(`Imported "${account}" from rentvine:`, counts);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
