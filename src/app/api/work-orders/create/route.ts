import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth/supabase-server";
import { unitBelongsToProperty } from "@/lib/rentvine-units";
import { rentvinePropertyId } from "@/lib/rentvine-ids";
import { createRentvineWorkOrder, isRentvineConfigured } from "@/lib/inspections/rentvine-wo";
import { recordCreatedWorkOrder } from "@/lib/created-work-orders";
import { formatAddress } from "@/lib/format";

// Create a work order straight in Rentvine from the Maintenance screen. Rentvine
// is the record (it then flows back through the usual syncs). Once Rentvine
// returns the WO number, a stand-in is kept so the work order shows on the
// Maintenance list right away (src/lib/created-work-orders.ts). Only a property
// (optionally a unit) and a description are needed; it's created as Requested
// (Rentvine's intake status), Medium priority unless another is picked.
export const dynamic = "force-dynamic";

const PRIORITY: Record<string, number> = { Low: 1, Medium: 2, High: 3 };

function rentvineWebBase(): string {
  const sub = process.env.RENTVINE_SUBDOMAIN || process.env.RENTVINE_ACCOUNT || "pmilighthouse";
  return `https://${sub}.rentvine.com`;
}

export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
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
    ? await prisma.property.findFirst({
        where: { externalId: propertyId },
        select: { id: true, street1: true, street2: true, city: true, state: true, zip: true },
      })
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

  // Show it on the Maintenance list now — only with the real WO number, the key
  // the LeadSimple row will arrive under. Best-effort: it's in Rentvine either way.
  if (result.number) {
    try {
      await recordCreatedWorkOrder(prisma, {
        number: result.number,
        rvId: result.id,
        propertyExternalId: propertyId,
        propertyLabel: property.street1 ? formatAddress(property) : "",
        unitId,
        priority: Object.keys(PRIORITY).find((k) => PRIORITY[k] === priorityId) ?? "Medium",
        description,
        createdBy: user.email ?? "",
      });
    } catch (e) {
      console.error("[wo-create] couldn't record the new work order for the list:", e);
    }
  }

  return NextResponse.json(
    {
      ok: true,
      number: result.ref,
      url: result.id ? `${rentvineWebBase()}/maintenance/work-orders/${result.id}` : null,
    },
    { status: 201 }
  );
}
