import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/supabase-server";
import { isFeatureEnabled } from "@/config/features";
import { saveSummaryDraft } from "@/lib/inspections/db";

// Save the owner message + selected photos for an inspection's summary WITHOUT
// sending the email. Lets the team draft the message now and send later.
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!isFeatureEnabled("inspections")) {
    return NextResponse.json({ error: "Inspections is disabled." }, { status: 404 });
  }
  if (!(await getCurrentUser())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const inspectionId = Number((await params).id);
  if (!Number.isFinite(inspectionId)) {
    return NextResponse.json({ error: "Bad id" }, { status: 400 });
  }

  const body = (await req.json().catch(() => ({}))) as {
    ownerMessage?: unknown;
    photoIds?: unknown;
  };
  const ownerMessage = typeof body.ownerMessage === "string" ? body.ownerMessage : "";
  const photoIds = Array.isArray(body.photoIds)
    ? body.photoIds.map((n) => Number(n)).filter(Number.isFinite)
    : [];

  try {
    await saveSummaryDraft(inspectionId, ownerMessage, photoIds);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Save failed." },
      { status: 500 }
    );
  }

  return NextResponse.json({ ok: true });
}
