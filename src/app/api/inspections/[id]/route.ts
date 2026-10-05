import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth/supabase-server";
import { isFeatureEnabled } from "@/config/features";

// Update or soft-delete an inspection. Update: owner or can_edit_all. Delete:
// owner or can_delete (soft delete via deleted_at). Writes to the single DB.
export const dynamic = "force-dynamic";

type ChecklistInput = {
  key?: string;
  label?: string;
  checked?: boolean;
  status?: string | null;
  issue_notes?: string | null;
};
type WorkItemInput = { service_name?: string; quantity?: number; notes?: string | null };

function s(v: unknown): string | null {
  const t = (typeof v === "string" ? v : "").trim();
  return t || null;
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!isFeatureEnabled("inspections")) {
    return NextResponse.json({ error: "Inspections is disabled." }, { status: 404 });
  }
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const inspectionId = Number((await params).id);
  if (!Number.isFinite(inspectionId)) {
    return NextResponse.json({ error: "Bad id" }, { status: 400 });
  }

  // Ownership: must own it or have can_edit_all.
  if (!user.canEditAll) {
    const owner = await prisma.inspectVisit.findUnique({
      where: { id: inspectionId },
      select: { created_by_user_id: true },
    });
    const ownerId = owner?.created_by_user_id;
    if (ownerId && ownerId !== user.id) {
      return NextResponse.json({ error: "You can only edit your own inspections." }, { status: 403 });
    }
  }

  const body = await req.json().catch(() => null);
  if (!body || !body.inspection_date) {
    return NextResponse.json({ error: "inspection_date is required" }, { status: 400 });
  }

  const checklist = (body.checklist ?? []) as ChecklistInput[];
  const workItems = ((body.work_items ?? []) as WorkItemInput[]).filter((w) => s(w.service_name));

  const ops: Prisma.PrismaPromise<unknown>[] = [
    prisma.inspectVisit.update({
      where: { id: inspectionId },
      data: {
        inspection_reason: s(body.inspection_reason),
        inspector_name: s(body.inspector_name),
        inspection_date: String(body.inspection_date),
        inspection_time: s(body.inspection_time),
        notes: s(body.notes),
        overall_status: s(body.overall_status),
        special_instructions: s(body.special_instructions),
      },
    }),
    prisma.inspectChecklistItem.deleteMany({ where: { inspection_id: inspectionId } }),
  ];
  if (checklist.length) {
    ops.push(
      prisma.inspectChecklistItem.createMany({
        data: checklist.map((c) => ({
          inspection_id: inspectionId,
          item_key: c.key ?? null,
          item_label: c.label ?? null,
          checked: c.checked ? 1 : 0,
          status: c.status ?? null,
          issue_notes: s(c.issue_notes),
        })),
      })
    );
  }
  ops.push(prisma.inspectWorkItem.deleteMany({ where: { inspection_id: inspectionId } }));
  if (workItems.length) {
    ops.push(
      prisma.inspectWorkItem.createMany({
        data: workItems.map((w) => ({
          inspection_id: inspectionId,
          service_name: (w.service_name ?? "").trim(),
          quantity: w.quantity || 1,
          notes: s(w.notes),
        })),
      })
    );
  }

  try {
    await prisma.$transaction(ops);
  } catch (e) {
    const message = e instanceof Error ? e.message : "Update failed";
    return NextResponse.json({ error: message }, { status: 502 });
  }

  return NextResponse.json({ id: inspectionId });
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!isFeatureEnabled("inspections")) {
    return NextResponse.json({ error: "Inspections is disabled." }, { status: 404 });
  }
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const inspectionId = Number((await params).id);
  if (!Number.isFinite(inspectionId)) {
    return NextResponse.json({ error: "Bad id" }, { status: 400 });
  }

  if (!user.canDelete) {
    const owner = await prisma.inspectVisit.findUnique({
      where: { id: inspectionId },
      select: { created_by_user_id: true },
    });
    const ownerId = owner?.created_by_user_id;
    if (!ownerId || ownerId !== user.id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
  }

  try {
    await prisma.inspectVisit.update({
      where: { id: inspectionId },
      data: { deleted_at: new Date() },
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Delete failed";
    return NextResponse.json({ error: message }, { status: 502 });
  }

  return NextResponse.json({ ok: true });
}
