import { prisma } from "@/lib/prisma";
import { rentvinePropertyId } from "@/lib/rentvine-ids";

// Properties that a record (invoice, bank transaction, work order) can be linked
// to, keyed by their stable externalId (what we store on the record). Former
// clients (inactive in Rentvine) are included — you still bill things to them —
// marked "(inactive)" and listed after the active ones. Server-side (Prisma).
export type PropertyOption = { externalId: string; label: string };

export async function listPropertyOptions(): Promise<PropertyOption[]> {
  const props = await prisma.property.findMany({
    where: { externalId: { not: null } },
    select: { externalId: true, name: true, street1: true, city: true, status: true },
    orderBy: [{ name: "asc" }, { street1: "asc" }],
  });
  return props
    .filter((p): p is typeof p & { externalId: string } => Boolean(p.externalId))
    .map((p) => {
      const main = p.name || p.street1 || "Untitled property";
      const base = p.city ? `${main} · ${p.city}` : main;
      const inactive = p.status !== "active";
      return { externalId: p.externalId, label: inactive ? `${base} (inactive)` : base, inactive };
    })
    .sort((a, b) => Number(a.inactive) - Number(b.inactive)) // stable: keeps name order within each group
    .map(({ externalId, label }) => ({ externalId, label }));
}

// Map of externalId → label, for resolving an invoice's property to a name.
export async function propertyLabelMap(): Promise<Record<string, string>> {
  const opts = await listPropertyOptions();
  const map: Record<string, string> = {};
  for (const o of opts) map[o.externalId] = o.label;
  return map;
}

// One entry in the Transactions property picker: a property, or one unit of a
// multi-unit property. Labels are unique (repeats get the property id).
export type PropertyChoice = { label: string; propertyId: string; unitId: string | null };

export function buildPropertyChoices(
  props: PropertyOption[],
  units: { unitId: string; propertyExternalId: string; name: string }[]
): PropertyChoice[] {
  const seen = new Map<string, number>();
  for (const p of props) seen.set(p.label, (seen.get(p.label) ?? 0) + 1);
  const unitsByProp = new Map<string, { unitId: string; name: string }[]>();
  for (const u of units) unitsByProp.set(u.propertyExternalId, [...(unitsByProp.get(u.propertyExternalId) ?? []), u]);

  const out: PropertyChoice[] = [];
  for (const p of props) {
    const label = (seen.get(p.label) ?? 0) > 1 ? `${p.label} (#${p.externalId})` : p.label;
    out.push({ label, propertyId: p.externalId, unitId: null });
    // Units carry the bare Rentvine property id; externalId is namespaced.
    const pu = unitsByProp.get(rentvinePropertyId(p.externalId)) ?? [];
    // Units only matter where there's more than one.
    if (pu.length > 1) {
      for (const u of pu) out.push({ label: `${label} — ${u.name || `Unit #${u.unitId}`}`, propertyId: p.externalId, unitId: u.unitId });
    }
  }
  return out;
}
