import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  console.log("Seeding PM-Central…");

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

  const ownerRivera = await prisma.contact.create({
    data: { firstName: "Ana", lastName: "Rivera", email: "ana@riverahomes.com", phone: "555-0101", roles: "owner" },
  });
  const ownerBlackrock = await prisma.contact.create({
    data: { companyName: "Blackrock Rentals LLC", email: "ops@blackrockrentals.com", roles: "owner" },
  });

  const tenants = await Promise.all(
    [
      ["James", "Carter"],
      ["Priya", "Shah"],
      ["Marcus", "Lee"],
      ["Elena", "Gomez"],
      ["Tom", "Nguyen"],
    ].map(([firstName, lastName]) =>
      prisma.contact.create({ data: { firstName, lastName, roles: "tenant" } })
    )
  );

  const vendor = await prisma.contact.create({
    data: { companyName: "ProFix Maintenance", email: "dispatch@profix.com", roles: "vendor" },
  });

  const riveraPortfolio = await prisma.portfolio.create({
    data: {
      name: "Rivera Family Holdings",
      owners: { create: { contactId: ownerRivera.id, ownershipPct: 100 } },
    },
  });
  const blackrockPortfolio = await prisma.portfolio.create({
    data: {
      name: "Blackrock Rentals",
      owners: { create: { contactId: ownerBlackrock.id, ownershipPct: 100 } },
    },
  });

  const p1 = await prisma.property.create({
    data: {
      name: "Maple St Rental",
      street1: "128 Maple St",
      city: "Austin",
      state: "TX",
      zip: "78704",
      propertyType: "single-family",
      portfolioId: riveraPortfolio.id,
      units: { create: { unitNumber: "1", beds: 3, baths: 2, sqft: 1450, marketRent: 2200, status: "occupied" } },
    },
    include: { units: true },
  });
  await createActiveLease(p1.units[0].id, tenants[0].id, 2200);

  const p2 = await prisma.property.create({
    data: {
      name: "Oakwood Duplex",
      street1: "44 Oakwood Ave",
      city: "Austin",
      state: "TX",
      zip: "78745",
      propertyType: "multi-family",
      portfolioId: riveraPortfolio.id,
      units: {
        create: [
          { unitNumber: "A", beds: 2, baths: 1, sqft: 900, marketRent: 1500, status: "occupied" },
          { unitNumber: "B", beds: 2, baths: 1, sqft: 900, marketRent: 1500, status: "vacant" },
        ],
      },
    },
    include: { units: true },
  });
  await createActiveLease(p2.units[0].id, tenants[1].id, 1475);

  const p3 = await prisma.property.create({
    data: {
      name: "Cedar Ct",
      street1: "9 Cedar Ct",
      city: "Round Rock",
      state: "TX",
      zip: "78664",
      propertyType: "single-family",
      portfolioId: blackrockPortfolio.id,
      source: "rentvine",
      externalId: "rv-prop-3391",
      units: { create: { unitNumber: "1", beds: 4, baths: 3, sqft: 2100, marketRent: 2850, status: "occupied", source: "rentvine", externalId: "rv-unit-8821" } },
    },
    include: { units: true },
  });
  await createActiveLease(p3.units[0].id, tenants[2].id, 2850);

  const p4 = await prisma.property.create({
    data: {
      name: "Birch Fourplex",
      street1: "301 Birch Ln",
      city: "Pflugerville",
      state: "TX",
      zip: "78660",
      propertyType: "multi-family",
      portfolioId: blackrockPortfolio.id,
      units: {
        create: [
          { unitNumber: "1", beds: 1, baths: 1, marketRent: 1200, status: "occupied" },
          { unitNumber: "2", beds: 1, baths: 1, marketRent: 1200, status: "occupied" },
          { unitNumber: "3", beds: 1, baths: 1, marketRent: 1200, status: "vacant" },
          { unitNumber: "4", beds: 1, baths: 1, marketRent: 1200, status: "vacant" },
        ],
      },
    },
    include: { units: true },
  });
  await createActiveLease(p4.units[0].id, tenants[3].id, 1200);
  await createActiveLease(p4.units[1].id, tenants[4].id, 1225);

  await prisma.property.create({
    data: {
      name: "Elm St (turning)",
      street1: "77 Elm St",
      city: "Austin",
      state: "TX",
      zip: "78702",
      propertyType: "single-family",
      portfolioId: riveraPortfolio.id,
      units: { create: { unitNumber: "1", beds: 2, baths: 2, marketRent: 1900, status: "vacant" } },
    },
  });

  await prisma.workOrder.create({
    data: {
      title: "HVAC not cooling",
      description: "Tenant reports AC blowing warm air.",
      status: "in-progress",
      priority: "high",
      propertyId: p1.id,
      vendorId: vendor.id,
    },
  });
  await prisma.workOrder.create({
    data: {
      title: "Leaking kitchen faucet",
      status: "open",
      priority: "normal",
      propertyId: p3.id,
    },
  });

  console.log("Seed complete.");
}

async function createActiveLease(unitId: string, tenantId: string, rent: number) {
  const lease = await prisma.lease.create({
    data: {
      unitId,
      status: "active",
      rent,
      deposit: rent,
      startDate: new Date(new Date().getFullYear(), 0, 1),
      endDate: new Date(new Date().getFullYear() + 1, 0, 1),
      tenants: { create: { contactId: tenantId, isPrimary: true } },
    },
  });
  await prisma.transaction.create({
    data: { leaseId: lease.id, type: "charge", amount: rent, memo: "Monthly rent" },
  });
  return lease;
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
