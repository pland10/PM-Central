import { NextResponse } from "next/server";
import { getInspectionsDb } from "@/lib/inspections/supabase";
import { getCurrentUser } from "@/lib/auth/supabase-server";
import { isFeatureEnabled } from "@/config/features";
import type { InspectionProperty, NamedOption, SpecialInstruction } from "@/lib/inspections/types";

// Reference data for the inspection create/edit form: properties, reasons,
// services, and special instructions (with the property IDs each is assigned to).
export const dynamic = "force-dynamic";

export async function GET() {
  if (!isFeatureEnabled("inspections")) {
    return NextResponse.json({ error: "Inspections is disabled." }, { status: 404 });
  }
  if (!(await getCurrentUser())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const db = getInspectionsDb();
  if (!db) return NextResponse.json({ error: "Not configured" }, { status: 503 });

  const [propsRes, reasonsRes, servicesRes, instrRes, linkRes] = await Promise.all([
    db.from("pmi_inspect_properties").select("id,name,address").order("name"),
    db.from("pmi_inspect_reasons").select("id,name,sort_order").order("sort_order"),
    db.from("pmi_inspect_services").select("id,name,sort_order").order("sort_order"),
    db.from("pmi_inspect_special_instructions").select("id,name,sort_order").order("sort_order"),
    db.from("pmi_inspect_property_instructions").select("property_id,instruction_id"),
  ]);

  const firstErr = [propsRes, reasonsRes, servicesRes, instrRes, linkRes].find((r) => r.error);
  if (firstErr?.error) {
    return NextResponse.json({ error: firstErr.error.message }, { status: 502 });
  }

  const links = (linkRes.data ?? []) as { property_id: number; instruction_id: number }[];
  const byInstruction = new Map<number, number[]>();
  for (const l of links) {
    const arr = byInstruction.get(l.instruction_id) ?? [];
    arr.push(l.property_id);
    byInstruction.set(l.instruction_id, arr);
  }

  const specialInstructions: SpecialInstruction[] = ((instrRes.data ?? []) as NamedOption[]).map(
    (i) => ({ ...i, property_ids: byInstruction.get(i.id) ?? [] })
  );

  return NextResponse.json({
    properties: (propsRes.data ?? []) as InspectionProperty[],
    reasons: (reasonsRes.data ?? []) as NamedOption[],
    services: (servicesRes.data ?? []) as NamedOption[],
    specialInstructions,
  });
}
