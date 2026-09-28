import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

// Real data pulled from the pmilighthouse Rentvine account via the Rentvine
// connector. Properties + active leases (tenants/occupancy) are real; rent
// amounts are a follow-up enrichment (not exposed in the list endpoints).
// externalId ties each record back to Rentvine so a future live import upserts
// cleanly on (source, externalId) instead of duplicating.

type P = {
  id: number;
  street: string;
  city: string;
  state: string;
  zip: string;
  type: string;
};

const properties: P[] = [
  { id: 5, street: "18 Timber Ridge Drive", city: "Holtsville", state: "NY", zip: "11742", type: "single-family" },
  { id: 6, street: "37 Andiron Lane", city: "Brookhaven", state: "NY", zip: "11719", type: "single-family" },
  { id: 9, street: "11 Glen Hollow Drive", city: "Holtsville", state: "NY", zip: "11742", type: "single-family" },
  { id: 11, street: "5 Ring Ln", city: "Levittown", state: "NY", zip: "11756", type: "single-family" },
  { id: 18, street: "29 Parkway Avenue", city: "Amityville", state: "NY", zip: "11701", type: "single-family" },
  { id: 19, street: "71 Lambeth Street", city: "Holbrook", state: "NY", zip: "11741", type: "single-family" },
  { id: 20, street: "21 Cleveland st apt 1", city: "Valley Stream", state: "NY", zip: "11580", type: "apartment" },
  { id: 23, street: "11 Grassfield Road", city: "Great Neck", state: "NY", zip: "11024", type: "single-family" },
  { id: 24, street: "1 Thornton St", city: "Patchogue", state: "NY", zip: "11772", type: "single-family" },
  { id: 27, street: "161 Smithtown Polk Blvd", city: "Centereach", state: "NY", zip: "11720", type: "single-family" },
  { id: 30, street: "257 Center St", city: "Williston Park", state: "NY", zip: "11596", type: "single-family" },
  { id: 35, street: "185 North Indiana Avenue", city: "Lindenhurst", state: "NY", zip: "11757", type: "apartment" },
  { id: 36, street: "19 Colgate Road", city: "Great Neck", state: "NY", zip: "11023", type: "single-family" },
  { id: 37, street: "25 Thorney Avenue", city: "Huntington Station", state: "NY", zip: "11746", type: "single-family" },
  { id: 38, street: "144 Storm Drive", city: "Holtsville", state: "NY", zip: "11742", type: "single-family" },
  { id: 40, street: "66 Francis Court", city: "Elmont", state: "NY", zip: "11003", type: "single-family" },
  { id: 41, street: "24-12 42nd Road Apt 2E", city: "Long Island City", state: "NY", zip: "11101", type: "condo" },
  { id: 44, street: "160 Red Dirt Rd", city: "East Hampton", state: "NY", zip: "11937", type: "single-family" },
  { id: 45, street: "25 Willow Drive", city: "Coram", state: "NY", zip: "11727", type: "townhouse" },
  { id: 48, street: "8204 138th Street", city: "Jamaica", state: "NY", zip: "11435", type: "apartment" },
  { id: 49, street: "130 Rolling Street", city: "Lynbrook", state: "NY", zip: "11563", type: "single-family" },
  { id: 50, street: "17 Rondell Ln", city: "Centereach", state: "NY", zip: "11720", type: "single-family" },
  { id: 51, street: "15 Canyon Street", city: "Huntington", state: "NY", zip: "11743", type: "single-family" },
  { id: 52, street: "64 Blacksmith Rd", city: "Levittown", state: "NY", zip: "11756", type: "single-family" },
  { id: 53, street: "2 Carlyle Drive", city: "Glen Cove", state: "NY", zip: "11542", type: "single-family" },
  { id: 55, street: "128 Lockwood Avenue", city: "Huntington Station", state: "NY", zip: "11746", type: "single-family" },
  { id: 56, street: "117 Upton Dr", city: "Sound Beach", state: "NY", zip: "11789", type: "single-family" },
  { id: 57, street: "136 West Henrietta Avenue", city: "Oceanside", state: "NY", zip: "11572", type: "single-family" },
  { id: 58, street: "115 8th Avenue", city: "Huntington Station", state: "NY", zip: "11746", type: "single-family" },
  { id: 61, street: "4072 Darby Lane", city: "Seaford", state: "NY", zip: "11783", type: "single-family" },
  { id: 62, street: "356 Vanderbilt Motor Parkway", city: "Hauppauge", state: "NY", zip: "11788", type: "commercial" },
  { id: 63, street: "61 Mill Lane", city: "Huntington", state: "NY", zip: "11743", type: "single-family" },
  { id: 67, street: "37 Margaret Blvd", city: "Merrick", state: "NY", zip: "11566", type: "single-family" },
  { id: 68, street: "54 Pembrook Drive", city: "Stony Brook", state: "NY", zip: "11790", type: "single-family" },
  { id: 69, street: "2077 Feuereisen Ave", city: "Ronkonkoma", state: "NY", zip: "11779", type: "single-family" },
  { id: 70, street: "6 Harbor Ln", city: "Glen Head", state: "NY", zip: "11545", type: "single-family" },
  { id: 71, street: "654 Bermuda Rd", city: "West Babylon", state: "NY", zip: "11704", type: "single-family" },
  { id: 72, street: "100 West Broadway", city: "Long Beach", state: "NY", zip: "11561", type: "single-family" },
  { id: 73, street: "47 Columbine Ave", city: "Islip", state: "NY", zip: "11751", type: "single-family" },
  { id: 74, street: "16 Bittersweet Place", city: "Huntington", state: "NY", zip: "11743", type: "single-family" },
  { id: 75, street: "18-47 26th Rd", city: "Astoria", state: "NY", zip: "11102", type: "single-family" },
  { id: 76, street: "15 Amys Court", city: "East Hampton", state: "NY", zip: "11937", type: "multi-family" },
  { id: 77, street: "13 Beaver Trail", city: "Coram", state: "NY", zip: "11727", type: "single-family" },
  { id: 78, street: "1245 U.S. 1", city: "Edison", state: "NJ", zip: "08837", type: "commercial" },
  { id: 79, street: "796 Amboy Avenue", city: "Perth Amboy", state: "NJ", zip: "08861", type: "commercial" },
  { id: 81, street: "796 Amboy Avenue", city: "Perth Amboy", state: "NJ", zip: "08861", type: "commercial" },
];

// Active leases: primary tenant + the property address they belong to.
const activeLeases: { street: string; city: string; tenant: string }[] = [
  { street: "257 Center St", city: "Williston Park", tenant: "Taichna Charles" },
  { street: "654 Bermuda Rd", city: "West Babylon", tenant: "Nebia Chui" },
  { street: "25 Thorney Avenue", city: "Huntington Station", tenant: "Miljiam Licona" },
  { street: "37 Margaret Blvd", city: "Merrick", tenant: "Audrey Rakovich Seville" },
  { street: "185 North Indiana Avenue", city: "Lindenhurst", tenant: "Megan Purdue" },
  { street: "21 Cleveland st apt 1", city: "Valley Stream", tenant: "Victoria Pierre-Louis" },
  { street: "24-12 42nd Road Apt 2E", city: "Long Island City", tenant: "Selina Sun" },
  { street: "130 Rolling Street", city: "Lynbrook", tenant: "Lori Stevens" },
  { street: "71 Lambeth Street", city: "Holbrook", tenant: "Karen Vasilecozzo" },
  { street: "8204 138th Street", city: "Jamaica", tenant: "Linda Muñoz Gallo" },
  { street: "115 8th Avenue", city: "Huntington Station", tenant: "Marvin Geovanni Raymundo" },
  { street: "117 Upton Dr", city: "Sound Beach", tenant: "Claudia Lipinski" },
  { street: "66 Francis Court", city: "Elmont", tenant: "Pamela Roberts" },
  { street: "2 Carlyle Drive", city: "Glen Cove", tenant: "Alec Longo" },
  { street: "11 Glen Hollow Drive", city: "Holtsville", tenant: "Catherine Smith" },
  { street: "5 Ring Ln", city: "Levittown", tenant: "julie dimaggio" },
  { street: "8204 138th Street", city: "Jamaica", tenant: "Hossein Torresramos" },
  { street: "8204 138th Street", city: "Jamaica", tenant: "Cynthia Tabora" },
  { street: "128 Lockwood Avenue", city: "Huntington Station", tenant: "Joely Rojas López" },
  { street: "1 Thornton St", city: "Patchogue", tenant: "Bobbye Sanders" },
  { street: "15 Canyon Street", city: "Huntington", tenant: "Michael Serrant" },
  { street: "18 Timber Ridge Drive", city: "Holtsville", tenant: "Stephany Seifert" },
  { street: "161 Smithtown Polk Blvd", city: "Centereach", tenant: "Chantel Rausche Williams" },
  { street: "17 Rondell Ln", city: "Centereach", tenant: "Maria Galindo" },
  { street: "64 Blacksmith Rd", city: "Levittown", tenant: "Robert Kreib" },
  { street: "796 Amboy Avenue", city: "Perth Amboy", tenant: "Rachel Barnes" },
  { street: "25 Willow Drive", city: "Coram", tenant: "Michael J Hayes" },
  { street: "1245 U.S. 1", city: "Edison", tenant: "Health Up Training and Services LLC" },
  { street: "19 Colgate Road", city: "Great Neck", tenant: "Nechama Neren Silverman" },
  { street: "29 Parkway Avenue", city: "Amityville", tenant: "Timothy Robert Walker" },
  { street: "37 Andiron Lane", city: "Brookhaven", tenant: "Jonathan M Ebel" },
];

const key = (street: string, city: string) =>
  `${street.trim().toLowerCase()}|${city.trim().toLowerCase()}`;

function tenantContactData(name: string) {
  const isCompany = /\b(llc|inc|corp|services|company|co)\b/i.test(name);
  if (isCompany) {
    return { companyName: name, roles: "tenant", source: "rentvine" as const };
  }
  const parts = name.trim().split(/\s+/);
  return {
    firstName: parts[0],
    lastName: parts.slice(1).join(" ") || null,
    roles: "tenant",
    source: "rentvine" as const,
  };
}

async function main() {
  console.log("Seeding PM-Central with real Rentvine data…");

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

  // Group active leases by property address.
  const leasesByProperty = new Map<string, string[]>();
  for (const l of activeLeases) {
    const k = key(l.street, l.city);
    const arr = leasesByProperty.get(k) ?? [];
    arr.push(l.tenant);
    leasesByProperty.set(k, arr);
  }

  let occupiedUnits = 0;
  let totalUnits = 0;

  for (const p of properties) {
    const property = await prisma.property.create({
      data: {
        name: p.street,
        street1: p.street,
        city: p.city,
        state: p.state,
        zip: p.zip,
        propertyType: p.type,
        status: "active",
        source: "rentvine",
        externalId: `rv-prop-${p.id}`,
      },
    });

    const tenants = leasesByProperty.get(key(p.street, p.city)) ?? [];

    if (tenants.length === 0) {
      await prisma.unit.create({
        data: { unitNumber: "1", status: "vacant", propertyId: property.id, source: "rentvine" },
      });
      totalUnits += 1;
    } else {
      for (let i = 0; i < tenants.length; i++) {
        const unit = await prisma.unit.create({
          data: {
            unitNumber: String(i + 1),
            status: "occupied",
            propertyId: property.id,
            source: "rentvine",
          },
        });
        const contact = await prisma.contact.create({ data: tenantContactData(tenants[i]) });
        await prisma.lease.create({
          data: {
            unitId: unit.id,
            status: "active",
            rent: 0,
            source: "rentvine",
            tenants: { create: { contactId: contact.id, isPrimary: true } },
          },
        });
        occupiedUnits += 1;
        totalUnits += 1;
      }
    }
  }

  console.log(
    `Seed complete: ${properties.length} properties, ${totalUnits} units, ${occupiedUnits} occupied.`
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
