import { prisma } from "@/lib/prisma";
import type {
  InspectionRow,
  ChecklistItem,
  WorkItem,
  InspectionPhoto,
  InspectionProperty,
  NamedOption,
  SpecialInstruction,
} from "./types";

// Inspection data access over PM-Central's single database (Prisma/Postgres).
// The inspection tables moved here from the inspections Supabase project; photo
// FILES still live in Supabase Storage and inspectors are Supabase Auth users.
// The app speaks the original snake_case shapes, so timestamps (Date in Prisma)
// are coerced back to ISO strings and nullable scalars normalized here.

function iso(d: Date | null | undefined): string | null {
  return d ? d.toISOString() : null;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function toRow(r: any): InspectionRow {
  return {
    id: r.id,
    property_id: r.property_id ?? null,
    inspection_reason: r.inspection_reason ?? null,
    inspector_name: r.inspector_name ?? null,
    inspection_date: r.inspection_date ?? null,
    inspection_time: r.inspection_time ?? null,
    notes: r.notes ?? null,
    overall_status: r.overall_status ?? null,
    special_instructions: r.special_instructions ?? null,
    created_by_user_id: r.created_by_user_id ?? null,
    created_at: iso(r.created_at),
    updated_at: iso(r.updated_at),
    deleted_at: iso(r.deleted_at),
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function toChecklist(c: any): ChecklistItem {
  return {
    id: c.id,
    inspection_id: c.inspection_id,
    item_key: c.item_key ?? null,
    item_label: c.item_label ?? null,
    checked: c.checked ?? 0,
    status: c.status ?? null,
    issue_notes: c.issue_notes ?? null,
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function toWork(w: any): WorkItem {
  return {
    id: w.id,
    inspection_id: w.inspection_id,
    service_name: w.service_name ?? null,
    quantity: w.quantity ?? null,
    notes: w.notes ?? null,
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function toPhoto(p: any): InspectionPhoto {
  return {
    id: p.id,
    inspection_id: p.inspection_id,
    filename: p.filename ?? null,
    original_name: p.original_name ?? null,
    url: p.url ?? null,
  };
}

function toProperty(p: { id: number; name: string | null; address: string | null }): InspectionProperty {
  return { id: p.id, name: p.name, address: p.address };
}

// --- Reads -----------------------------------------------------------------

export async function listInspectionRows(): Promise<InspectionRow[]> {
  const [ins, props, photos] = await Promise.all([
    prisma.inspectVisit.findMany({
      where: { deleted_at: null },
      orderBy: { inspection_date: "desc" },
      take: 2000,
    }),
    prisma.inspectProperty.findMany({ select: { id: true, name: true, address: true } }),
    prisma.inspectPhoto.findMany({ select: { inspection_id: true } }),
  ]);
  const propMap = new Map(props.map((p) => [p.id, p]));
  const counts = new Map<number, number>();
  for (const ph of photos) counts.set(ph.inspection_id, (counts.get(ph.inspection_id) ?? 0) + 1);
  return ins.map((r) => {
    const p = r.property_id != null ? propMap.get(r.property_id) : undefined;
    return {
      ...toRow(r),
      property_name: p?.name ?? "",
      property_address: p?.address ?? "",
      photo_count: counts.get(r.id) ?? 0,
    };
  });
}

export type InspectionDetailData = {
  inspection: InspectionRow;
  property: InspectionProperty | null;
  checklist: ChecklistItem[];
  photos: InspectionPhoto[];
  workItems: WorkItem[];
};

export async function getInspectionDetail(id: number): Promise<InspectionDetailData | null> {
  const insp = await prisma.inspectVisit.findFirst({ where: { id, deleted_at: null } });
  if (!insp) return null;
  const [property, checklist, photos, workItems] = await Promise.all([
    insp.property_id != null
      ? prisma.inspectProperty.findUnique({
          where: { id: insp.property_id },
          select: { id: true, name: true, address: true },
        })
      : Promise.resolve(null),
    prisma.inspectChecklistItem.findMany({ where: { inspection_id: id }, orderBy: { id: "asc" } }),
    prisma.inspectPhoto.findMany({ where: { inspection_id: id }, orderBy: { id: "asc" } }),
    prisma.inspectWorkItem.findMany({ where: { inspection_id: id }, orderBy: { id: "asc" } }),
  ]);
  return {
    inspection: toRow(insp),
    property: property ? toProperty(property) : null,
    checklist: checklist.map(toChecklist),
    photos: photos.map(toPhoto),
    workItems: workItems.map(toWork),
  };
}

// Most recent inspections for a PM-Central property, matched by its Rentvine id
// (rv_id on the inspection property). Used by the property-360 page.
export async function inspectionsForRvId(rvId: string): Promise<InspectionRow[]> {
  if (!rvId) return [];
  const props = await prisma.inspectProperty.findMany({
    where: { rv_id: rvId },
    select: { id: true },
  });
  const ids = props.map((p) => p.id);
  if (!ids.length) return [];
  const ins = await prisma.inspectVisit.findMany({
    where: { property_id: { in: ids }, deleted_at: null },
    orderBy: { inspection_date: "desc" },
    take: 10,
  });
  return ins.map(toRow);
}

// Reference data for the create/edit form (everything except inspectors, which
// are Supabase Auth users and fetched separately).
export type InspectionMetaTables = {
  properties: InspectionProperty[];
  reasons: NamedOption[];
  services: NamedOption[];
  specialInstructions: SpecialInstruction[];
};

export async function getInspectionMetaTables(): Promise<InspectionMetaTables> {
  const [props, reasons, services, instr, links] = await Promise.all([
    prisma.inspectProperty.findMany({
      select: { id: true, name: true, address: true },
      orderBy: { name: "asc" },
    }),
    prisma.inspectReason.findMany({ select: { id: true, name: true, sort_order: true }, orderBy: { sort_order: "asc" } }),
    prisma.inspectService.findMany({ select: { id: true, name: true, sort_order: true }, orderBy: { sort_order: "asc" } }),
    prisma.inspectSpecialInstruction.findMany({
      select: { id: true, name: true, sort_order: true },
      orderBy: { sort_order: "asc" },
    }),
    prisma.inspectPropertyInstruction.findMany({ select: { property_id: true, instruction_id: true } }),
  ]);

  const byInstruction = new Map<number, number[]>();
  for (const l of links) {
    const a = byInstruction.get(l.instruction_id) ?? [];
    a.push(l.property_id);
    byInstruction.set(l.instruction_id, a);
  }

  const named = (x: { id: number; name: string; sort_order: number | null }): NamedOption => ({
    id: x.id,
    name: x.name,
    sort_order: x.sort_order ?? undefined,
  });

  return {
    properties: props.map(toProperty),
    reasons: reasons.map(named),
    services: services.map(named),
    specialInstructions: instr.map((i) => ({ ...named(i), property_ids: byInstruction.get(i.id) ?? [] })),
  };
}
