import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth/supabase-server";
import { isFeatureEnabled } from "@/config/features";

// Create an inspection (+ its checklist and work items) in PM-Central's single
// database (Prisma/Postgres). Records the creator.
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

  const body = await req.json().catch(() => null);
  if (!body || !body.property_id || !body.inspection_date) {
    return NextResponse.json(
      { error: "property_id and inspection_date are required" },
      { status: 400 }
    );
  }

  const checklist = (body.checklist ?? []) as ChecklistInput[];
  const cleanWork = ((body.work_items ?? []) as WorkItemInput[]).filter((w) => s(w.service_name));

  try {
    const created = await prisma.inspectVisit.create({
      data: {
        property_id: Number(body.property_id),
        inspection_reason: s(body.inspection_reason),
        inspector_name: s(body.inspector_name) ?? user.name,
        inspection_date: String(body.inspection_date),
        inspection_time: s(body.inspection_time),
        notes: s(body.notes),
        overall_status: s(body.overall_status),
        special_instructions: s(body.special_instructions),
        created_by_user_id: user.id,
      },
      select: { id: true },
    });

    if (checklist.length) {
      await prisma.inspectChecklistItem.createMany({
        data: checklist.map((c) => ({
          inspection_id: created.id,
          item_key: c.key ?? null,
          item_label: c.label ?? null,
          checked: c.checked ? 1 : 0,
          status: c.status ?? null,
          issue_notes: s(c.issue_notes),
        })),
      });
    }

    if (cleanWork.length) {
      await prisma.inspectWorkItem.createMany({
        data: cleanWork.map((w) => ({
          inspection_id: created.id,
          service_name: (w.service_name ?? "").trim(),
          quantity: w.quantity || 1,
          notes: s(w.notes),
        })),
      });
    }

    return NextResponse.json({ id: created.id }, { status: 201 });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Insert failed";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
