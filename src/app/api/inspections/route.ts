import { NextRequest, NextResponse } from "next/server";
import { getInspectionsDb } from "@/lib/inspections/supabase";
import { getCurrentUser } from "@/lib/auth/supabase-server";
import { isFeatureEnabled } from "@/config/features";

// Create an inspection (+ its checklist and work items). Writes to the
// inspections Supabase project with the service key; records the creator.
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

export async function POST(req: NextRequest) {
  if (!isFeatureEnabled("inspections")) {
    return NextResponse.json({ error: "Inspections is disabled." }, { status: 404 });
  }
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const db = getInspectionsDb();
  if (!db) return NextResponse.json({ error: "Not configured" }, { status: 503 });

  const body = await req.json().catch(() => null);
  if (!body || !body.property_id || !body.inspection_date) {
    return NextResponse.json(
      { error: "property_id and inspection_date are required" },
      { status: 400 }
    );
  }

  const { data, error } = await db
    .from("pmi_inspect_inspections")
    .insert({
      property_id: body.property_id,
      inspection_reason: s(body.inspection_reason),
      inspector_name: s(body.inspector_name) ?? user.name,
      inspection_date: body.inspection_date,
      inspection_time: s(body.inspection_time),
      notes: s(body.notes),
      overall_status: s(body.overall_status),
      special_instructions: s(body.special_instructions),
      created_by_user_id: user.id,
    })
    .select("id")
    .single();

  if (error || !data) {
    return NextResponse.json({ error: error?.message ?? "Insert failed" }, { status: 502 });
  }
  const inspectionId = data.id as number;

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

  const workItems = (body.work_items ?? []) as WorkItemInput[];
  const cleanWork = workItems.filter((w) => s(w.service_name));
  if (cleanWork.length) {
    await db.from("pmi_inspect_work_items").insert(
      cleanWork.map((w) => ({
        inspection_id: inspectionId,
        service_name: (w.service_name ?? "").trim(),
        quantity: w.quantity || 1,
        notes: s(w.notes),
      }))
    );
  }

  return NextResponse.json({ id: inspectionId }, { status: 201 });
}
