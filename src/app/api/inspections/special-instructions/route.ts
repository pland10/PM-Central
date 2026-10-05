import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth/supabase-server";
import { isFeatureEnabled } from "@/config/features";

// Manage the special-instruction library and which houses each applies to.
// Admin only. Stored in the single DB (pmi_inspect_special_instructions +
// pmi_inspect_property_instructions).
export const dynamic = "force-dynamic";

async function requireAdmin() {
  if (!isFeatureEnabled("inspections")) return { error: "Inspections is disabled.", status: 404 as const };
  const user = await getCurrentUser();
  if (!user) return { error: "Unauthorized", status: 401 as const };
  if (user.role !== "admin") return { error: "Admins only", status: 403 as const };
  return { ok: true as const };
}

// Create a new special instruction, optionally assigned to properties.
export async function POST(req: NextRequest) {
  const gate = await requireAdmin();
  if ("error" in gate) return NextResponse.json({ error: gate.error }, { status: gate.status });

  const body = await req.json().catch(() => null);
  const name = (body?.name ?? "").trim();
  if (!name) return NextResponse.json({ error: "name is required" }, { status: 400 });

  try {
    const created = await prisma.inspectSpecialInstruction.create({ data: { name }, select: { id: true } });
    const propertyIds = (body?.property_ids ?? []) as number[];
    if (propertyIds.length) {
      await prisma.inspectPropertyInstruction.createMany({
        data: propertyIds.map((pid) => ({ instruction_id: created.id, property_id: Number(pid) })),
      });
    }
    return NextResponse.json({ id: created.id }, { status: 201 });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Insert failed";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}

// Update an instruction: rename and/or replace its property assignments.
export async function PUT(req: NextRequest) {
  const gate = await requireAdmin();
  if ("error" in gate) return NextResponse.json({ error: gate.error }, { status: gate.status });

  const body = await req.json().catch(() => null);
  const id = Number(body?.id);
  if (!Number.isFinite(id)) return NextResponse.json({ error: "Bad id" }, { status: 400 });

  try {
    if (typeof body.name === "string" && body.name.trim()) {
      await prisma.inspectSpecialInstruction.update({ where: { id }, data: { name: body.name.trim() } });
    }
    if (Array.isArray(body.property_ids)) {
      const propertyIds = body.property_ids as number[];
      await prisma.inspectPropertyInstruction.deleteMany({ where: { instruction_id: id } });
      if (propertyIds.length) {
        await prisma.inspectPropertyInstruction.createMany({
          data: propertyIds.map((pid) => ({ instruction_id: id, property_id: Number(pid) })),
        });
      }
    }
  } catch (e) {
    const message = e instanceof Error ? e.message : "Update failed";
    return NextResponse.json({ error: message }, { status: 502 });
  }
  return NextResponse.json({ id });
}

export async function DELETE(req: NextRequest) {
  const gate = await requireAdmin();
  if ("error" in gate) return NextResponse.json({ error: gate.error }, { status: gate.status });

  const id = Number(req.nextUrl.searchParams.get("id"));
  if (!Number.isFinite(id)) return NextResponse.json({ error: "Bad id" }, { status: 400 });

  try {
    // Remove the house assignments first, then the instruction.
    await prisma.inspectPropertyInstruction.deleteMany({ where: { instruction_id: id } });
    await prisma.inspectSpecialInstruction.delete({ where: { id } });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Delete failed";
    return NextResponse.json({ error: message }, { status: 502 });
  }
  return NextResponse.json({ ok: true });
}
