import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth/supabase-server";
import { unitBelongsToProperty } from "@/lib/rentvine-units";
import { rentvinePropertyId } from "@/lib/rentvine-ids";
import { createRentvineWorkOrder, isRentvineConfigured } from "@/lib/inspections/rentvine-wo";

// Create a work order straight in Rentvine from the Maintenance screen. Nothing
// is stored in PM-Central — Rentvine is the record (it then flows back through
// the usual syncs). Only a property (optionally a unit) and a description are
// needed; it's created as Requested (Rentvine's intake status), Medium priority
// unless another is picked.
export const dynamic = "force-dynamic";

const PRIORITY: Record<string, number> = { Low: 1, Medium: 2, High: 3 };

function rentvineWebBase(): string {
  const sub = process.env.RENTVINE_SUBDOMAIN || process.env.RENTVINE_ACCOUNT || "pmilighthouse";
  return `https://${sub}.rentvine.com`;
}

export async function POST(req: NextRequest) {
  if (!(await getCurrentUser())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isRentvineConfigured()) {
    return NextResponse.json({ error: "Rentvine isn't configured on this server." }, { status: 503 });
  }

  const b = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const propertyId = typeof b.propertyId === "string" ? b.propertyId : "";
  const unitId = typeof b.unitId === "string" && b.unitId ? b.unitId : null;
  const description = typeof b.description === "string" ? b.description.trim() : "";
  const priorityId = PRIORITY[String(b.priority ?? "Medium")] ?? PRIORITY.Medium;

  if (!description) return NextResponse.json({ error: "Describe the work needed." }, { status: 400 });
  if (description.length > 5000) return NextResponse.json({ error: "Description is too long." }, { status: 400 });
  const property = propertyId
    ? await prisma.property.findFirst({ where: { externalId: propertyId }, select: { id: true } })
    : null;
  if (!property) return NextResponse.json({ error: "Pick a property from the list." }, { status: 400 });
  if (unitId && !(await unitBelongsToProperty(prisma, unitId, propertyId))) {
    return NextResponse.json({ error: "That unit isn't part of the property — pick from the list." }, { status: 400 });
  }

  const result = await createRentvineWorkOrder({
    propertyId: rentvinePropertyId(propertyId),
    unitId,
    description,
    priorityId,
  });
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 502 });

  return NextResponse.json(
    {
      ok: true,
      number: result.ref,
      url: result.id ? `${rentvineWebBase()}/maintenance/work-orders/${result.id}` : null,
    },
    { status: 201 }
  );
}
