/**
 * One-time migration: copy the inspection LIBRARY/reference tables from the
 * inspections Supabase project into PM-Central's single database (Neon).
 *
 * Copies: properties, reasons, services, special_instructions, and the
 * property→instruction assignments — preserving ids (so the assignments line
 * up). Does NOT copy visit records (inspections / checklist / work items /
 * photos): those are disposable and start fresh in Neon.
 *
 * Idempotent: upserts by id and rebuilds the assignment links, so it can be
 * re-run (once for the dev Neon branch, once for prod).
 *
 * Requires in the environment:
 *   DATABASE_URL            -> the TARGET Neon branch (dev or prod)
 *   NEXT_PUBLIC_SUPABASE_URL-> the SOURCE inspections Supabase project
 *   SUPABASE_SERVICE_KEY    -> its service_role (secret) key
 *
 * Run:  npm run migrate:inspections
 */
import { prisma } from "../src/lib/prisma";
import { getInspectionsDb } from "../src/lib/inspections/supabase";

async function main() {
  const db = getInspectionsDb();
  if (!db) {
    throw new Error(
      "Source not configured: set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_KEY."
    );
  }

  const [propsRes, reasonsRes, servicesRes, instrRes, linksRes] = await Promise.all([
    db.from("pmi_inspect_properties").select("id,name,address,rv_id"),
    db.from("pmi_inspect_reasons").select("id,name,sort_order"),
    db.from("pmi_inspect_services").select("id,name,sort_order"),
    db.from("pmi_inspect_special_instructions").select("id,name,sort_order"),
    db.from("pmi_inspect_property_instructions").select("property_id,instruction_id"),
  ]);
  for (const r of [propsRes, reasonsRes, servicesRes, instrRes, linksRes]) {
    if (r.error) throw new Error(`Read failed: ${r.error.message}`);
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const props = (propsRes.data ?? []) as any[];
  for (const p of props) {
    const data = { name: p.name ?? null, address: p.address ?? null, rv_id: p.rv_id != null ? String(p.rv_id) : null };
    await prisma.inspectProperty.upsert({ where: { id: p.id }, create: { id: p.id, ...data }, update: data });
  }
  console.log(`Properties: ${props.length}`);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const reasons = (reasonsRes.data ?? []) as any[];
  for (const r of reasons) {
    const data = { name: r.name, sort_order: r.sort_order ?? null };
    await prisma.inspectReason.upsert({ where: { id: r.id }, create: { id: r.id, ...data }, update: data });
  }
  console.log(`Reasons: ${reasons.length}`);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const services = (servicesRes.data ?? []) as any[];
  for (const s of services) {
    const data = { name: s.name, sort_order: s.sort_order ?? null };
    await prisma.inspectService.upsert({ where: { id: s.id }, create: { id: s.id, ...data }, update: data });
  }
  console.log(`Services: ${services.length}`);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const instr = (instrRes.data ?? []) as any[];
  for (const i of instr) {
    const data = { name: i.name, sort_order: i.sort_order ?? null };
    await prisma.inspectSpecialInstruction.upsert({ where: { id: i.id }, create: { id: i.id, ...data }, update: data });
  }
  console.log(`Special instructions: ${instr.length}`);

  // Rebuild the assignment links (their own id doesn't matter).
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const links = (linksRes.data ?? []) as any[];
  await prisma.inspectPropertyInstruction.deleteMany({});
  if (links.length) {
    await prisma.inspectPropertyInstruction.createMany({
      data: links.map((l) => ({ property_id: l.property_id, instruction_id: l.instruction_id })),
    });
  }
  console.log(`Property↔instruction links: ${links.length}`);

  // Reset the serial sequences past the max id we inserted explicitly.
  for (const table of [
    "pmi_inspect_properties",
    "pmi_inspect_reasons",
    "pmi_inspect_services",
    "pmi_inspect_special_instructions",
  ]) {
    await prisma.$executeRawUnsafe(
      `SELECT setval(pg_get_serial_sequence('${table}', 'id'), (SELECT COALESCE(MAX(id), 1) FROM "${table}"))`
    );
  }
  console.log("Sequences reset. Done.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
