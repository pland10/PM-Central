import { NextRequest, NextResponse } from "next/server";
import { getInspectionsDb } from "@/lib/inspections/supabase";
import { getCurrentUser } from "@/lib/auth/supabase-server";
import { isFeatureEnabled } from "@/config/features";

// Update or soft-delete an inspection. Update: owner or can_edit_all. Delete:
// owner or can_delete (soft delete via deleted_at).
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
  const db = getInspectionsDb();
  if (!db) return NextResponse.json({ error: "Not configured" }, { status: 503 });

  const inspectionId = Number((await params).id);
  if (!Number.isFinite(inspectionId)) {
    return NextResponse.json({ error: "Bad id" }, { status: 400 });
  }

  // Ownership: must own it or have can_edit_all.
  if (!user.canEditAll) {
    const owner = await db
      .from("pmi_inspect_inspections")
      .select("created_by_user_id")
      .eq("id", inspectionId)
      .maybeSingle();
    const ownerId = owner.data?.created_by_user_id;
    if (ownerId && ownerId !== user.id) {
      return NextResponse.json({ error: "You can only edit your own inspections." }, { status: 403 });
    }
  }

  const body = await req.json().catch(() => null);
  if (!body || !body.inspection_date) {
    return NextResponse.json({ error: "inspection_date is required" }, { status: 400 });
  }

  const upd = await db
    .from("pmi_inspect_inspections")
    .update({
      inspection_reason: s(body.inspection_reason),
      inspector_name: s(body.inspector_name),
      inspection_date: body.inspection_date,
      inspection_time: s(body.inspection_time),
      notes: s(body.notes),
      overall_status: s(body.overall_status),
      special_instructions: s(body.special_instructions),
      updated_at: new Date().toISOString(),
    })
    .eq("id", inspectionId);
  if (upd.error) return NextResponse.json({ error: upd.error.message }, { status: 502 });

  // Replace checklist + work items.
  await db.from("pmi_inspect_checklist_items").delete().eq("inspection_id", inspectionId);
  const checklist = (body.checklist ?? []) as ChecklistInput[];
  if (checklist.length) {
    await db.from("pmi_inspect_checklist_items").insert(
      checklist.map((c) => ({
        inspection_id: inspectionId,
        item_key: c.key ?? null,
        item_label: c.label ?? null,
        checked: c.checked ? 1 : 0,
        status: c.status ?? null,
        issue_notes: s(c.issue_notes),
      }))
    );
  }

  await db.from("pmi_inspect_work_items").delete().eq("inspection_id", inspectionId);
  const workItems = ((body.work_items ?? []) as WorkItemInput[]).filter((w) => s(w.service_name));
  if (workItems.length) {
    await db.from("pmi_inspect_work_items").insert(
      workItems.map((w) => ({
        inspection_id: inspectionId,
        service_name: (w.service_name ?? "").trim(),
        quantity: w.quantity || 1,
        notes: s(w.notes),
      }))
    );
  }

  return NextResponse.json({ id: inspectionId });
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!isFeatureEnabled("inspections")) {
    return NextResponse.json({ error: "Inspections is disabled." }, { status: 404 });
  }
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const db = getInspectionsDb();
  if (!db) return NextResponse.json({ error: "Not configured" }, { status: 503 });

  const inspectionId = Number((await params).id);
  if (!Number.isFinite(inspectionId)) {
    return NextResponse.json({ error: "Bad id" }, { status: 400 });
  }

  if (!user.canDelete) {
    const owner = await db
      .from("pmi_inspect_inspections")
      .select("created_by_user_id")
      .eq("id", inspectionId)
      .maybeSingle();
    const ownerId = owner.data?.created_by_user_id;
    if (!ownerId || ownerId !== user.id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
  }

  const del = await db
    .from("pmi_inspect_inspections")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", inspectionId);
  if (del.error) return NextResponse.json({ error: del.error.message }, { status: 502 });

  return NextResponse.json({ ok: true });
}
