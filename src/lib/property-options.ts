import { prisma } from "@/lib/prisma";

// Properties that an invoice can be linked to, keyed by their stable externalId
// (what we store on the invoice). Server-side (Prisma) — used by the invoice
// editor's property picker and the invoicing list's property labels.
export type PropertyOption = { externalId: string; label: string };

export async function listPropertyOptions(): Promise<PropertyOption[]> {
  const props = await prisma.property.findMany({
    where: { externalId: { not: null }, status: "active" },
    select: { externalId: true, name: true, street1: true, city: true },
    orderBy: [{ name: "asc" }, { street1: "asc" }],
  });
  return props
    .filter((p): p is typeof p & { externalId: string } => Boolean(p.externalId))
    .map((p) => {
      const main = p.name || p.street1 || "Untitled property";
      const label = p.city ? `${main} · ${p.city}` : main;
      return { externalId: p.externalId, label };
    });
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
    const pu = unitsByProp.get(p.externalId) ?? [];
    // Units only matter where there's more than one.
    if (pu.length > 1) {
      for (const u of pu) out.push({ label: `${label} — ${u.name || `Unit #${u.unitId}`}`, propertyId: p.externalId, unitId: u.unitId });
    }
  }
  return out;
}
