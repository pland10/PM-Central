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
