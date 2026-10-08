import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth/supabase-server";
import { isFeatureEnabled } from "@/config/features";
import { getInspectionDetail } from "@/lib/inspections/db";
import { buildInspectionSummary } from "@/lib/inspections/summary";
import { sendEmail, isEmailConfigured, type EmailAttachment } from "@/lib/email";

// Complete & send: email an inspection summary (with the sender-selected photos
// attached) to the inspections inbox, then stamp summary_sent_at. Needs
// RESEND_API_KEY; recipient is INSPECTION_SUMMARY_TO (default info@pmilighthouse.com).
export const dynamic = "force-dynamic";

const DEFAULT_TO = "info@pmilighthouse.com";
const MAX_ATTACH_BYTES = 20 * 1024 * 1024; // keep the whole email well under Resend's cap

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!isFeatureEnabled("inspections")) {
    return NextResponse.json({ error: "Inspections is disabled." }, { status: 404 });
  }
  if (!(await getCurrentUser())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!isEmailConfigured()) {
    return NextResponse.json(
      { error: "Email isn't configured — set RESEND_API_KEY." },
      { status: 503 }
    );
  }

  const inspectionId = Number((await params).id);
  if (!Number.isFinite(inspectionId)) {
    return NextResponse.json({ error: "Bad id" }, { status: 400 });
  }

  const body = (await req.json().catch(() => ({}))) as { photoIds?: unknown };
  const photoIds = new Set(
    Array.isArray(body.photoIds) ? body.photoIds.map((n) => Number(n)).filter(Number.isFinite) : []
  );

  const detail = await getInspectionDetail(inspectionId);
  if (!detail) return NextResponse.json({ error: "Inspection not found." }, { status: 404 });

  // Fetch the selected photos and attach them (best-effort; skip any that fail
  // or that would push the email over the size cap).
  const attachments: EmailAttachment[] = [];
  let totalBytes = 0;
  for (const p of detail.photos) {
    if (!photoIds.has(p.id) || !p.url) continue;
    try {
      const res = await fetch(p.url);
      if (!res.ok) continue;
      const buf = Buffer.from(await res.arrayBuffer());
      if (totalBytes + buf.length > MAX_ATTACH_BYTES) continue;
      totalBytes += buf.length;
      attachments.push({
        filename: p.original_name || p.filename || `photo-${p.id}.jpg`,
        content: buf.toString("base64"),
        contentType: res.headers.get("content-type") || undefined,
      });
    } catch {
      // skip a photo we couldn't fetch
    }
  }

  const { subject, html } = buildInspectionSummary({
    inspection: detail.inspection,
    property: detail.property,
    checklist: detail.checklist,
    workItems: detail.workItems,
    attachedPhotoCount: attachments.length,
  });

  const to = process.env.INSPECTION_SUMMARY_TO || DEFAULT_TO;
  const result = await sendEmail({ to, subject, html, attachments });
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  const sentAt = new Date();
  try {
    await prisma.inspectVisit.update({
      where: { id: inspectionId },
      data: { summary_sent_at: sentAt },
    });
  } catch {
    // email already went out; don't fail the request over the timestamp
  }

  return NextResponse.json({
    ok: true,
    to,
    attached: attachments.length,
    sentAt: sentAt.toISOString(),
  });
}
