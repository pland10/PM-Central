import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth/supabase-server";
import { listStaff } from "@/lib/staff";
import { sendEmail } from "@/lib/email";
import { matchStaffEmail, noteEmail, normalizeNoteBody, resolveRecipients } from "@/lib/work-order-notes";
import { addNote, deleteNote, listNotes, markEmailed, noteAuthor, updateNote } from "@/lib/work-order-notes-db";
import { pendingNumber, resolveWorkOrderId } from "@/lib/created-work-orders";
import { getTech } from "@/lib/work-order-tech-db";
import { notifyWorkOrderNote } from "@/lib/notify-wo-updated";

// Work-order notes (Work Orders list → Notes). Any signed-in user.
//   GET    ?wo=<id>                     → notes (newest first) + who can be emailed
//   POST   { woId, body, emailTo? }     → save; email only if emailTo is given
//                                          (one address or a list), and only to
//                                          PM-Central users — one email to all.
//   PATCH  { id, body }                 → edit a note (author or an admin)
//   DELETE ?id=<id>                     → delete a note (author or an admin)
export const dynamic = "force-dynamic";

// A note can be edited or deleted by whoever wrote it, or by an admin.
type SessionUser = { email?: string | null; role?: string | null };
const canModify = (user: SessionUser, authorEmail: string) =>
  user.role === "admin" ||
  (!!user.email && !!authorEmail && user.email.toLowerCase() === authorEmail.toLowerCase());

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

// The id notes are kept under, plus the work order's details. A just-created
// work order ("pmc:<number>") uses its stand-in until LeadSimple has it, then
// the LeadSimple row (src/lib/created-work-orders.ts).
async function resolveWorkOrder(id: string): Promise<{ id: string; wo: WoRow } | null> {
  if (pendingNumber(id) === null) {
    const wo = await workOrder(id);
    return wo ? { id, wo } : null;
  }
  const target = await resolveWorkOrderId(prisma, id);
  if (!target) return null;
  if (target !== id) {
    const wo = await workOrder(target);
    return wo ? { id: target, wo } : null;
  }
  const [c] = await prisma.$queryRaw<{ wo_number: string; description: string | null; property_label: string | null }[]>(
    Prisma.sql`SELECT wo_number, description, property_label FROM pm_created_work_orders WHERE wo_number = ${pendingNumber(id)}`
  );
  if (!c) return null;
  const title = (c.description ?? "").split("\n")[0].trim() || "Work order";
  return {
    id,
    wo: { wo_number: c.wo_number, title, name: null, property_address: c.property_label, link: null, assignee_name: null },
  };
}

export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const woId = req.nextUrl.searchParams.get("wo") ?? "";
  if (!woId) return NextResponse.json({ error: "Missing wo." }, { status: 400 });
  try {
    const found = await resolveWorkOrder(woId);
    const [notes, staff] = await Promise.all([listNotes(found?.id ?? woId), listStaff()]);
    const wo = found?.wo ?? null;
    return NextResponse.json({
      notes,
      staff,
      assigneeEmail: matchStaffEmail(wo?.assignee_name ?? "", staff),
      me: user.email ?? "",
      canModerate: user.role === "admin",
    });
  } catch (e) {
    console.error("[wo-notes] list failed:", e);
    return NextResponse.json({ error: "Could not load notes." }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const b = await req.json().catch(() => null);
  const id = Number(b?.id);
  const body = normalizeNoteBody(b?.body);
  if (!Number.isInteger(id) || id <= 0) return NextResponse.json({ error: "Missing note." }, { status: 400 });
  if (!body) return NextResponse.json({ error: "Write a note first." }, { status: 400 });

  try {
    const author = await noteAuthor(id);
    if (author === null) return NextResponse.json({ error: "Note not found." }, { status: 404 });
    if (!canModify(user, author)) {
      return NextResponse.json({ error: "You can only edit your own notes." }, { status: 403 });
    }
    const note = await updateNote(id, body);
    if (!note) return NextResponse.json({ error: "Note not found." }, { status: 404 });
    return NextResponse.json({ note });
  } catch (e) {
    console.error("[wo-notes] edit failed:", e);
    return NextResponse.json({ error: "Could not save the edit." }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const id = Number(req.nextUrl.searchParams.get("id"));
  if (!Number.isInteger(id) || id <= 0) return NextResponse.json({ error: "Missing note." }, { status: 400 });

  try {
    const author = await noteAuthor(id);
    if (author === null) return NextResponse.json({ ok: true }); // already gone — idempotent
    if (!canModify(user, author)) {
      return NextResponse.json({ error: "You can only delete your own notes." }, { status: 403 });
    }
    await deleteNote(id);
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("[wo-notes] delete failed:", e);
    return NextResponse.json({ error: "Could not delete the note." }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const b = await req.json().catch(() => null);
  const woId = typeof b?.woId === "string" ? b.woId : "";
  const body = normalizeNoteBody(b?.body);
  if (!woId || !body) return NextResponse.json({ error: "Write a note first." }, { status: 400 });

  // Only PM-Central users can be emailed — never an arbitrary address.
  const wantsEmail = b?.emailTo !== undefined && b?.emailTo !== null;
  const picked = resolveRecipients(b?.emailTo, wantsEmail ? await listStaff() : []);
  if ("error" in picked) {
    return NextResponse.json({ error: "Pick people who use PM-Central to email." }, { status: 400 });
  }
  const recipients = picked.emails;

  try {
    const found = await resolveWorkOrder(woId);
    if (!found) return NextResponse.json({ error: "Work order not found." }, { status: 404 });
    const { wo } = found;
    const number = wo.wo_number ?? "—";
    const author = user.name || user.email || "PM-Central";
    const note = await addNote({ woId: found.id, woNumber: number, body, authorEmail: user.email ?? "", authorName: author });

    // Ping the in-house tech on this WO (if any) that there's a new note — unless
    // they wrote it. Best-effort; never blocks saving the note.
    const tech = await getTech(found.id);
    if (tech) await notifyWorkOrderNote({ tech, woId: found.id, woNumber: number, byEmail: user.email ?? null, body });

    if (recipients.length === 0) return NextResponse.json({ note, emailed: false }, { status: 201 });

    const mail = noteEmail({
      number,
      issue: wo.title || wo.name || "Work order",
      property: wo.property_address ?? "",
      author,
      body,
      appUrl: `${req.nextUrl.origin}/maintenance`,
      leadSimpleUrl: wo.link ?? undefined,
    });
    const sent = await sendEmail({ to: recipients, ...mail, replyTo: user.email ?? undefined });
    if (!sent.ok) {
      return NextResponse.json({ note, emailed: false, emailError: sent.error }, { status: 201 });
    }
    const emailedTo = recipients.join(", ");
    await markEmailed(note.id, emailedTo);
    return NextResponse.json({ note: { ...note, emailedTo }, emailed: true }, { status: 201 });
  } catch (e) {
    console.error("[wo-notes] save failed:", e);
    return NextResponse.json({ error: "Could not save the note." }, { status: 500 });
  }
}
