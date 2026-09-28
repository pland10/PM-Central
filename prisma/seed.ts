import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

// Real data pulled from the pmilighthouse Rentvine account via the Rentvine
// connector: 46 properties, active leases (tenant + contact info + term), and
// the 50 most recent of 410 work orders. Rent amounts remain a follow-up.
// externalId ties each record back to Rentvine (rv-prop-<id>, rv-wo-<id>) so a
// future live import upserts on (source, externalId) instead of duplicating.

type P = { id: number; street: string; city: string; state: string; zip: string; type: string };

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

// Active leases: property (by Rentvine id), primary tenant + contact info + term.
type L = {
  prop: number;
  tenant: string;
  email?: string;
  phone?: string;
  start: string;
  end: string;
};

const activeLeases: L[] = [
  { prop: 30, tenant: "Taichna Charles", email: "c.taichna@yahoo.com", phone: "+15164767445", start: "2026-10-01", end: "2028-09-30" },
  { prop: 71, tenant: "Nebia Chui", email: "knsj8163@aol.com", phone: "+16315074202", start: "2026-10-01", end: "2028-03-31" },
  { prop: 37, tenant: "Miljiam Licona", email: "miljiamivonnelicona28@gmail.com", phone: "+19342069533", start: "2026-08-15", end: "2027-08-31" },
  { prop: 67, tenant: "Audrey Rakovich Seville", email: "audreyseville@protonmail.com", phone: "+19178389520", start: "2026-08-15", end: "2028-08-31" },
  { prop: 35, tenant: "Megan Purdue", email: "parduemegan@yahoo.com", phone: "+16316127931", start: "2026-08-01", end: "2027-07-31" },
  { prop: 20, tenant: "Victoria Pierre-Louis", email: "victoria.pierrelouis@yahoo.com", phone: "+17185933557", start: "2026-07-01", end: "2028-06-30" },
  { prop: 41, tenant: "Selina Sun", email: "selinas.sjy@gmail.com", phone: "+19175813783", start: "2026-07-01", end: "2027-09-30" },
  { prop: 49, tenant: "Lori Stevens", email: "lasny1993@gmail.com", phone: "+15164925070", start: "2026-06-19", end: "2027-06-30" },
  { prop: 19, tenant: "Karen Vasilecozzo", email: "Mandy02009@gmail.com", phone: "+16317673197", start: "2026-06-01", end: "2028-05-31" },
  { prop: 48, tenant: "Linda Muñoz Gallo", email: "lindavivianamunoz@gmail.com", phone: "+13476471691", start: "2026-06-01", end: "2027-05-31" },
  { prop: 58, tenant: "Marvin Geovanni Raymundo", email: "marvinraymundo2015@gmail.com", phone: "+16319604773", start: "2026-05-01", end: "2027-04-30" },
  { prop: 56, tenant: "Claudia Lipinski", email: "claudia.lipinski64@gmail.com", phone: "+16312207019", start: "2026-04-18", end: "2027-04-30" },
  { prop: 40, tenant: "Pamela Roberts", email: "deroche2002@yahoo.com", phone: "+13478582688", start: "2026-04-01", end: "2027-03-31" },
  { prop: 53, tenant: "Alec Longo", email: "Alongo@opt4lifeinc.com", phone: "+16319439655", start: "2026-03-22", end: "2027-03-31" },
  { prop: 9, tenant: "Catherine Smith", email: "cat42985@gmail.com", phone: "+16315619058", start: "2026-02-01", end: "2027-01-31" },
  { prop: 11, tenant: "julie dimaggio", email: "juliedimaggio1@outlook.com", phone: "+15163531279", start: "2026-01-15", end: "2027-01-14" },
  { prop: 48, tenant: "Hossein Torresramos", email: "housseinaissantorresramos@gmail.com", start: "2026-01-01", end: "2026-12-31" },
  { prop: 48, tenant: "Cynthia Tabora", email: "rcynthiaa21@yahoo.com", phone: "+13476392146", start: "2025-12-01", end: "2026-11-30" },
  { prop: 55, tenant: "Joely Rojas López", email: "j.rojaslopez@hotmail.com", phone: "+16316394073", start: "2025-11-09", end: "2027-11-30" },
  { prop: 24, tenant: "Bobbye Sanders", email: "bobbye_sanders@aol.com", phone: "+19282761601", start: "2025-11-01", end: "2026-10-31" },
  { prop: 51, tenant: "Michael Serrant", email: "Michael.serrant7@gmail.com", phone: "+15168534469", start: "2025-10-01", end: "2027-09-30" },
  { prop: 5, tenant: "Stephany Seifert", email: "stephanyseifert@gmail.com", phone: "+16316334134", start: "2025-09-01", end: "2027-08-31" },
  { prop: 27, tenant: "Chantel Rausche Williams", email: "Mizzchanshine@yahoo.com", phone: "+16318966721", start: "2025-09-01", end: "2027-08-31" },
  { prop: 50, tenant: "Maria Galindo", email: "m.galindo72@icloud.com", phone: "+15168500848", start: "2025-09-01", end: "2027-08-31" },
  { prop: 52, tenant: "Robert Kreib", email: "Robertkreib1@gmail.com", phone: "+15169030544", start: "2025-08-01", end: "2027-07-31" },
  { prop: 79, tenant: "Rachel Barnes", email: "rbarnes76@gmail.com", phone: "+17373791181", start: "2025-07-01", end: "2026-06-30" },
  { prop: 45, tenant: "Michael J Hayes", email: "Mikehayes23@aol.com", phone: "+16319223756", start: "2025-06-15", end: "2027-06-14" },
  { prop: 78, tenant: "Health Up Training and Services LLC", email: "Healthuptraining@gmail.com", phone: "+19082674143", start: "2025-05-01", end: "2030-04-30" },
  { prop: 36, tenant: "Nechama Neren Silverman", email: "Nsilverman0523@gmail.com", start: "2025-02-15", end: "2027-02-28" },
  { prop: 18, tenant: "Timothy Robert Walker", email: "Timothywalker_2@yahoo.com", phone: "+17344976102", start: "2024-07-15", end: "2026-07-31" },
  { prop: 6, tenant: "Jonathan M Ebel", email: "Jebel@netw1.com", phone: "+16313351589", start: "2024-01-01", end: "2026-12-31" },
];

// 50 most recent work orders (of 410 in Rentvine).
type WO = { id: number; prop: number; desc: string; priority: string };

const workOrders: WO[] = [
  { id: 423, prop: 24, desc: "Refrigerator is not functioning and appears to be completely dead", priority: "normal" },
  { id: 422, prop: 62, desc: "Junk cleanup in parking lot", priority: "normal" },
  { id: 421, prop: 77, desc: "Clean out the trash in the house", priority: "normal" },
  { id: 420, prop: 35, desc: "Buy fly traps", priority: "normal" },
  { id: 419, prop: 71, desc: "Chimney cleaning", priority: "normal" },
  { id: 418, prop: 5, desc: "The garage door won't open because the opener is not working", priority: "normal" },
  { id: 417, prop: 5, desc: "Three outlets are not working", priority: "normal" },
  { id: 416, prop: 69, desc: "Clogged drain line from the AHU causing overflow into the emergency drain pan and water damage.", priority: "normal" },
  { id: 415, prop: 41, desc: "The kitchen sink is leaking", priority: "normal" },
  { id: 414, prop: 67, desc: "Repair of the showerheads and handles", priority: "normal" },
  { id: 413, prop: 48, desc: "Buy a new garbage can as per the new NYC law", priority: "normal" },
  { id: 412, prop: 75, desc: "Buy a new garbage can per the new NYC law.", priority: "normal" },
  { id: 411, prop: 75, desc: "Do the registration of the building for 2027", priority: "normal" },
  { id: 410, prop: 48, desc: "Utility Bill", priority: "normal" },
  { id: 409, prop: 67, desc: "Fire place repair", priority: "normal" },
  { id: 408, prop: 58, desc: "New light outside", priority: "normal" },
  { id: 407, prop: 48, desc: "Check the air conditioning unit - Unit 1 tenant reports loud noise, not cooling well. Related to WO 100271.", priority: "normal" },
  { id: 406, prop: 61, desc: "Lawn mowing", priority: "normal" },
  { id: 405, prop: 61, desc: "Lawn mowing", priority: "normal" },
  { id: 404, prop: 48, desc: "Do the registration of the building for 2027", priority: "normal" },
  { id: 403, prop: 19, desc: "Purchase a new washing machine — repair company recommends replacing; machine too old to repair.", priority: "normal" },
  { id: 402, prop: 36, desc: "AC is not working", priority: "normal" },
  { id: 401, prop: 23, desc: "Shower Curtain", priority: "normal" },
  { id: 400, prop: 19, desc: "The washing machine is not completing the cycle, and the water is staying in it.", priority: "normal" },
  { id: 399, prop: 61, desc: "The siding came off and needs to be repaired", priority: "normal" },
  { id: 398, prop: 49, desc: "Need to send a plumber to repair the hose bib outside", priority: "normal" },
  { id: 397, prop: 75, desc: "Set up utilities in the building; confirm with attorney about the basement door handle.", priority: "normal" },
  { id: 396, prop: 75, desc: "Send registration paperwork to NYC HPD", priority: "normal" },
  { id: 395, prop: 44, desc: "Take pictures for property insurance.", priority: "normal" },
  { id: 394, prop: 44, desc: "The barn door came off and needs to be rehung.", priority: "normal" },
  { id: 393, prop: 37, desc: "Counter top stove: burners are not working", priority: "normal" },
  { id: 392, prop: 48, desc: "AC installation", priority: "normal" },
  { id: 391, prop: 53, desc: "Electric Bill.", priority: "normal" },
  { id: 390, prop: 56, desc: "The electricity keeps tripping in the house", priority: "normal" },
  { id: 389, prop: 52, desc: "Leak in the back porch ceiling", priority: "normal" },
  { id: 388, prop: 35, desc: "Move the AC units to the street.", priority: "normal" },
  { id: 387, prop: 35, desc: "Buy new fly flags", priority: "normal" },
  { id: 386, prop: 52, desc: "Get rid of the old broken dryer & stove", priority: "normal" },
  { id: 385, prop: 52, desc: "Water coming in through the awning ceiling when it rains.", priority: "normal" },
  { id: 384, prop: 5, desc: "2 new bushes", priority: "normal" },
  { id: 383, prop: 37, desc: "Work Order created in LeadSimple with empty description", priority: "low" },
  { id: 382, prop: 62, desc: "Install signage for the fire department at the restaurant.", priority: "normal" },
  { id: 381, prop: 62, desc: "Cut the lawn", priority: "normal" },
  { id: 380, prop: 69, desc: "Get a quote and do the sealcoating on the driveway.", priority: "normal" },
  { id: 379, prop: 69, desc: "Install a light in the kitchen", priority: "normal" },
  { id: 378, prop: 30, desc: "The fridge is not working", priority: "normal" },
  { id: 377, prop: 5, desc: "Replace 2 small bushes.", priority: "normal" },
  { id: 376, prop: 19, desc: "Leak in the ceiling by the living room.", priority: "normal" },
  { id: 375, prop: 19, desc: "Leak from the bathtub.", priority: "normal" },
  { id: 374, prop: 62, desc: "Repair of the alarm for the fire suppression system.", priority: "normal" },
];

function tenantContactData(l: L) {
  const isCompany = /\b(llc|inc|corp|services|company)\b/i.test(l.tenant);
  const base = { email: l.email ?? null, phone: l.phone ?? null, roles: "tenant", source: "rentvine" as const };
  if (isCompany) return { ...base, companyName: l.tenant };
  const parts = l.tenant.trim().split(/\s+/);
  return { ...base, firstName: parts[0], lastName: parts.slice(1).join(" ") || null };
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

  const propIdByRv = new Map<number, string>();
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
    propIdByRv.set(p.id, property.id);
  }

  const leasesByProp = new Map<number, L[]>();
  for (const l of activeLeases) {
    const arr = leasesByProp.get(l.prop) ?? [];
    arr.push(l);
    leasesByProp.set(l.prop, arr);
  }

  let occupiedUnits = 0;
  let totalUnits = 0;

  for (const p of properties) {
    const propertyId = propIdByRv.get(p.id)!;
    const leases = leasesByProp.get(p.id) ?? [];

    if (leases.length === 0) {
      await prisma.unit.create({
        data: { unitNumber: "1", status: "vacant", propertyId, source: "rentvine" },
      });
      totalUnits += 1;
    } else {
      for (let i = 0; i < leases.length; i++) {
        const l = leases[i];
        const unit = await prisma.unit.create({
          data: { unitNumber: String(i + 1), status: "occupied", propertyId, source: "rentvine" },
        });
        const contact = await prisma.contact.create({ data: tenantContactData(l) });
        await prisma.lease.create({
          data: {
            unitId: unit.id,
            status: "active",
            rent: 0,
            startDate: new Date(l.start),
            endDate: new Date(l.end),
            source: "rentvine",
            tenants: { create: { contactId: contact.id, isPrimary: true } },
          },
        });
        occupiedUnits += 1;
        totalUnits += 1;
      }
    }
  }

  let woCount = 0;
  for (const wo of workOrders) {
    const propertyId = propIdByRv.get(wo.prop);
    if (!propertyId) continue;
    const title = wo.desc.length > 60 ? wo.desc.slice(0, 57) + "…" : wo.desc;
    await prisma.workOrder.create({
      data: {
        title,
        description: wo.desc,
        status: "open",
        priority: wo.priority,
        propertyId,
        source: "rentvine",
        externalId: `rv-wo-${wo.id}`,
      },
    });
    woCount += 1;
  }

  console.log(
    `Seed complete: ${properties.length} properties, ${totalUnits} units, ${occupiedUnits} occupied, ${woCount} work orders.`
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
