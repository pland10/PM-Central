import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth/supabase-server";
import { listStaff } from "@/lib/staff";
import { sendEmail } from "@/lib/email";
import { matchStaffEmail, noteEmail, normalizeNoteBody } from "@/lib/work-order-notes";
import { addNote, listNotes, markEmailed } from "@/lib/work-order-notes-db";

// Work-order notes (Work Orders list → Notes). Any signed-in user.
//   GET  ?wo=<id>                       → notes (newest first) + who can be emailed
//   POST { woId, body, emailTo? }       → save; email only if emailTo is given,
//                                          and only to a PM-Central user.
export const dynamic = "force-dynamic";

type WoRow = {
  wo_number: string | null;
  title: string | null;
  name: string | null;
  property_address: string | null;
  link: string | null;
  assignee_name: string | null;
};

async function workOrder(id: string): Promise<WoRow | null> {
  const rows = await prisma.$queryRaw<WoRow[]>(Prisma.sql`
    SELECT wo_number, title, name, property_address, link, assignee_name
    FROM work_orders WHERE source_id = ${id}`);
  return rows[0] ?? null;
}

export async function GET(req: NextRequest) {
  if (!(await getCurrentUser())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const woId = req.nextUrl.searchParams.get("wo") ?? "";
  if (!woId) return NextResponse.json({ error: "Missing wo." }, { status: 400 });
  try {
    const [notes, staff, wo] = await Promise.all([listNotes(woId), listStaff(), workOrder(woId)]);
    return NextResponse.json({ notes, staff, assigneeEmail: matchStaffEmail(wo?.assignee_name ?? "", staff) });
  } catch (e) {
    console.error("[wo-notes] list failed:", e);
    return NextResponse.json({ error: "Could not load notes." }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const b = await req.json().catch(() => null);
  const woId = typeof b?.woId === "string" ? b.woId : "";
  const body = normalizeNoteBody(b?.body);
  if (!woId || !body) return NextResponse.json({ error: "Write a note first." }, { status: 400 });

  const emailTo = typeof b?.emailTo === "string" ? b.emailTo.trim().toLowerCase() : "";
  // Only PM-Central users can be emailed — never an arbitrary address.
  const staff = emailTo ? await listStaff() : [];
  const recipient = emailTo ? staff.find((s) => s.email.toLowerCase() === emailTo) : undefined;
  if (emailTo && !recipient) {
    return NextResponse.json({ error: "Pick someone who uses PM-Central to email." }, { status: 400 });
  }

  try {
    const wo = await workOrder(woId);
    if (!wo) return NextResponse.json({ error: "Work order not found." }, { status: 404 });
    const number = wo.wo_number ?? "—";
    const author = user.name || user.email || "PM-Central";
    const note = await addNote({ woId, woNumber: number, body, authorEmail: user.email ?? "", authorName: author });

    if (!recipient) return NextResponse.json({ note, emailed: false }, { status: 201 });

    const mail = noteEmail({
      number,
      issue: wo.title || wo.name || "Work order",
      property: wo.property_address ?? "",
      author,
      body,
      appUrl: `${req.nextUrl.origin}/work-orders`,
      leadSimpleUrl: wo.link ?? undefined,
    });
    const sent = await sendEmail({ to: recipient.email, ...mail, replyTo: user.email ?? undefined });
    if (!sent.ok) {
      return NextResponse.json({ note, emailed: false, emailError: sent.error }, { status: 201 });
    }
    await markEmailed(note.id, recipient.email);
    return NextResponse.json({ note: { ...note, emailedTo: recipient.email }, emailed: true }, { status: 201 });
  } catch (e) {
    console.error("[wo-notes] save failed:", e);
    return NextResponse.json({ error: "Could not save the note." }, { status: 500 });
  }
}
