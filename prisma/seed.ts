import { PrismaClient } from "@prisma/client";
import { rentvineToCanonical } from "../src/import/sources/rentvine/transform";
import { pmilighthouse } from "../src/import/sources/rentvine/accounts/pmilighthouse";
import { loadCanonical } from "../src/import/load";

// Local dev reset. Wipes everything, then runs the import pipeline for the
// bundled account through the SAME generic loader as `npm run import`. For a
// multi-company or additive import (no full wipe), use `npm run import`.

async function main() {
  const prisma = new PrismaClient();
  try {
    console.log("Resetting database and importing bundled Rentvine data…");

    await prisma.transaction.deleteMany();
    await prisma.bill.deleteMany();
    await prisma.workOrder.deleteMany();
    await prisma.inspection.deleteMany();
    await prisma.leaseTenant.deleteMany();
    await prisma.lease.deleteMany();
    await prisma.unit.deleteMany();
    await prisma.property.deleteMany();
    await prisma.ownerLink.deleteMany();
    await prisma.portfolio.deleteMany();
    await prisma.contact.deleteMany();

    const dataset = rentvineToCanonical(pmilighthouse);
    const counts = await loadCanonical(prisma, dataset);
    console.log("Seed complete:", counts);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
