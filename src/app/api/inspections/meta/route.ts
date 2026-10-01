import { NextResponse } from "next/server";
import { getInspectionsDb } from "@/lib/inspections/supabase";
import { getCurrentUser } from "@/lib/auth/supabase-server";
import { isFeatureEnabled } from "@/config/features";
import type {
  InspectionProperty,
  NamedOption,
  SpecialInstruction,
  Inspector,
} from "@/lib/inspections/types";

// Reference data for the inspection create/edit form: properties, reasons,
// services, special instructions (with the property IDs each is assigned to),
// and the inspectors (the people with login accounts).
export const dynamic = "force-dynamic";

export async function GET() {
  if (!isFeatureEnabled("inspections")) {
    return NextResponse.json({ error: "Inspections is disabled." }, { status: 404 });
  }
  const me = await getCurrentUser();
  if (!me) {
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

  // Inspectors = the login users on this Supabase project (admin API).
  let inspectors: Inspector[] = [];
  try {
    const usersRes = await db.auth.admin.listUsers({ page: 1, perPage: 1000 });
    inspectors = (usersRes.data?.users ?? [])
      .map((u) => {
        const m = (u.user_metadata ?? {}) as Record<string, unknown>;
        const name =
          (typeof m.full_name === "string" && m.full_name) ||
          (typeof m.name === "string" && m.name) ||
          u.email ||
          "";
        return { id: u.id, email: u.email ?? null, name };
      })
      .filter((u) => u.name)
      .sort((a, b) => a.name.toLowerCase().localeCompare(b.name.toLowerCase()));
  } catch {
    inspectors = [];
  }

  return NextResponse.json({
    properties: (propsRes.data ?? []) as InspectionProperty[],
    reasons: (reasonsRes.data ?? []) as NamedOption[],
    services: (servicesRes.data ?? []) as NamedOption[],
    specialInstructions,
    inspectors,
    me: { id: me.id, name: me.name },
  });
}
