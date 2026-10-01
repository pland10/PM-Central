import { NextRequest, NextResponse } from "next/server";
import { getInspectionsDb } from "@/lib/inspections/supabase";
import { getCurrentUser } from "@/lib/auth/supabase-server";
import { isFeatureEnabled } from "@/config/features";

// Manage the special-instruction library and which houses each applies to.
// Admin only. The per-property assignment is the "only for certain houses"
// feature, stored in pmi_inspect_property_instructions.
export const dynamic = "force-dynamic";

async function requireAdmin() {
  if (!isFeatureEnabled("inspections")) return { error: "Inspections is disabled.", status: 404 };
  const user = await getCurrentUser();
  if (!user) return { error: "Unauthorized", status: 401 };
  if (user.role !== "admin") return { error: "Admins only", status: 403 };
  const db = getInspectionsDb();
  if (!db) return { error: "Not configured", status: 503 };
  return { db };
}

// Create a new special instruction, optionally assigned to properties.
export async function POST(req: NextRequest) {
  const gate = await requireAdmin();
  if ("error" in gate) return NextResponse.json({ error: gate.error }, { status: gate.status });
  const { db } = gate;

  const body = await req.json().catch(() => null);
  const name = (body?.name ?? "").trim();
  if (!name) return NextResponse.json({ error: "name is required" }, { status: 400 });

  const ins = await db
    .from("pmi_inspect_special_instructions")
    .insert({ name })
    .select("id")
    .single();
  if (ins.error || !ins.data) {
    return NextResponse.json({ error: ins.error?.message ?? "Insert failed" }, { status: 502 });
  }

  const propertyIds = (body?.property_ids ?? []) as number[];
  if (propertyIds.length) {
    await db.from("pmi_inspect_property_instructions").insert(
      propertyIds.map((pid) => ({ instruction_id: ins.data.id, property_id: pid }))
    );
  }
  return NextResponse.json({ id: ins.data.id }, { status: 201 });
}

// Update an instruction: rename and/or replace its property assignments.
export async function PUT(req: NextRequest) {
  const gate = await requireAdmin();
  if ("error" in gate) return NextResponse.json({ error: gate.error }, { status: gate.status });
  const { db } = gate;

  const body = await req.json().catch(() => null);
  const id = Number(body?.id);
  if (!Number.isFinite(id)) return NextResponse.json({ error: "Bad id" }, { status: 400 });

  if (typeof body.name === "string" && body.name.trim()) {
    await db
      .from("pmi_inspect_special_instructions")
      .update({ name: body.name.trim() })
      .eq("id", id);
  }

  if (Array.isArray(body.property_ids)) {
    const propertyIds = body.property_ids as number[];
    await db.from("pmi_inspect_property_instructions").delete().eq("instruction_id", id);
    if (propertyIds.length) {
      await db.from("pmi_inspect_property_instructions").insert(
        propertyIds.map((pid) => ({ instruction_id: id, property_id: pid }))
      );
    }
  }
  return NextResponse.json({ id });
}

export async function DELETE(req: NextRequest) {
  const gate = await requireAdmin();
  if ("error" in gate) return NextResponse.json({ error: gate.error }, { status: gate.status });
  const { db } = gate;

  const id = Number(req.nextUrl.searchParams.get("id"));
  if (!Number.isFinite(id)) return NextResponse.json({ error: "Bad id" }, { status: 400 });

  // property_instructions rows cascade-delete via their FK.
  const del = await db.from("pmi_inspect_special_instructions").delete().eq("id", id);
  if (del.error) return NextResponse.json({ error: del.error.message }, { status: 502 });
  return NextResponse.json({ ok: true });
}
