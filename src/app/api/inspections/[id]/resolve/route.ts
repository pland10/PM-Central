import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth/supabase-server";
import { isFeatureEnabled } from "@/config/features";
import { getInspectionDetail, setResolution, clearResolution } from "@/lib/inspections/db";
import { createRentvineWorkOrder, isRentvineConfigured } from "@/lib/inspections/rentvine-wo";
import { buildWorkOrderDescription } from "@/lib/inspections/work-order-text";

// Resolve a "Needs attention" inspection. Actions:
//   resolved   — mark handled, with an optional note
//   work_order — create a real Rentvine work order on the property, store its #
//   reopen     — undo a prior resolution
export const dynamic = "force-dynamic";
// Creates a Rentvine work order over the REST API — headroom on serverless.
export const maxDuration = 60;

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!isFeatureEnabled("inspections")) {
    return NextResponse.json({ error: "Inspections is disabled." }, { status: 404 });
  }
  const me = await getCurrentUser();
  if (!me) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const inspectionId = Number((await params).id);
  if (!Number.isFinite(inspectionId)) {
    return NextResponse.json({ error: "Bad id" }, { status: 400 });
  }

  const body = (await req.json().catch(() => ({}))) as {
    action?: unknown;
    note?: unknown;
    description?: unknown;
    priorityId?: unknown;
  };
  const action = String(body.action || "");
  const note = typeof body.note === "string" ? body.note : "";

  if (action === "reopen") {
    await clearResolution(inspectionId);
    return NextResponse.json({ ok: true, resolution: null });
  }

  if (action === "resolved") {
    await setResolution(inspectionId, "resolved", { note, userId: me.id });
    return NextResponse.json({ ok: true, resolution: "resolved" });
  }

  if (action === "work_order") {
    if (!isRentvineConfigured()) {
      return NextResponse.json(
        { error: "Rentvine isn't configured — set RENTVINE_API_KEY / RENTVINE_API_SECRET." },
        { status: 503 }
      );
    }
    const detail = await getInspectionDetail(inspectionId);
    if (!detail) return NextResponse.json({ error: "Inspection not found." }, { status: 404 });
    if (detail.inspection.property_id == null) {
      return NextResponse.json({ error: "This inspection has no property." }, { status: 400 });
    }
    const prop = await prisma.inspectProperty.findUnique({
      where: { id: detail.inspection.property_id },
      select: { rv_id: true },
    });
    if (!prop?.rv_id) {
      return NextResponse.json(
        { error: "This inspection's property isn't linked to Rentvine, so a work order can't be created." },
        { status: 400 }
      );
    }

    const description =
      (typeof body.description === "string" && body.description.trim()) ||
      buildWorkOrderDescription(detail);
    const priorityId = Number(body.priorityId);

    const result = await createRentvineWorkOrder({
      propertyId: prop.rv_id,
      description,
      priorityId: Number.isFinite(priorityId) ? priorityId : undefined,
    });
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }

    await setResolution(inspectionId, "work_order", {
      note,
      userId: me.id,
      workOrderRef: result.ref,
    });
    return NextResponse.json({ ok: true, resolution: "work_order", workOrderRef: result.ref });
  }

  return NextResponse.json({ error: "Unknown action." }, { status: 400 });
}
