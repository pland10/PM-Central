import { NextRequest, NextResponse } from "next/server";
import { isFeatureEnabled } from "@/config/features";
import { getCurrentUser } from "@/lib/auth/supabase-server";
import { canAccessAccounting } from "@/lib/accounting-access";
import { listAccountingStaff } from "@/lib/staff";
import { sendEmail } from "@/lib/email";
import { normalizeNoteBody, resolveRecipients } from "@/lib/work-order-notes";
import { isMonthKey } from "@/lib/owner-draws";
import { ownerDrawNoteEmail } from "@/lib/owner-draw-notes";
import {
  addOwnerDrawNote,
  deleteOwnerDrawNote,
  listOwnerDrawNotes,
  markOwnerDrawNoteEmailed,
  ownerDrawNoteAuthor,
  updateOwnerDrawNote,
} from "@/lib/owner-draw-notes-db";

// Notes on an owner's draws (Accounting → Owner Draws → Notes), like the Bank
// Transactions notes. Accounting users only.
//   GET    ?portfolio=<id>                                  → the owner's notes (all months, newest first) + who can be emailed
//   POST   { portfolioId, month, name?, body, emailTo? }    → save for that month; email only if emailTo is
//                                                             given, and only to people with Accounting access
//   PATCH  { id, body }                                     → edit (author or an admin)
//   DELETE ?id=<id>                                         → delete (author or an admin)
export const dynamic = "force-dynamic";

type SessionUser = { email?: string | null; role?: string | null; name?: string | null };
const canModify = (user: SessionUser | null, authorEmail: string) =>
  !user ||
  user.role === "admin" ||
  (!!user.email && !!authorEmail && user.email.toLowerCase() === authorEmail.toLowerCase());

async function gate(): Promise<{ user: SessionUser | null; deny?: NextResponse }> {
  if (!isFeatureEnabled("accounting")) return { user: null, deny: NextResponse.json({ error: "Not found." }, { status: 404 }) };
  const user = await getCurrentUser();
  if (!canAccessAccounting(user)) return { user, deny: NextResponse.json({ error: "Not found." }, { status: 404 }) };
  return { user };
}

const validId = (v: unknown): v is string => typeof v === "string" && v.trim().length > 0 && v.length <= 40;

export async function GET(req: NextRequest) {
  const { user, deny } = await gate();
  if (deny) return deny;
  const portfolioId = req.nextUrl.searchParams.get("portfolio") ?? "";
  if (!validId(portfolioId)) return NextResponse.json({ error: "Missing owner." }, { status: 400 });
  try {
    const [notes, staff] = await Promise.all([listOwnerDrawNotes(portfolioId), listAccountingStaff()]);
    return NextResponse.json({ notes, staff, assigneeEmail: "", me: user?.email ?? "", canModerate: !user || user.role === "admin" });
  } catch (e) {
    console.error("[owner-draw-notes] list failed:", e instanceof Error ? e.message : e);
    return NextResponse.json({ error: "Could not load notes." }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  const { user, deny } = await gate();
  if (deny) return deny;
  const b = await req.json().catch(() => null);
  const id = Number(b?.id);
  const body = normalizeNoteBody(b?.body);
  if (!Number.isInteger(id) || id <= 0) return NextResponse.json({ error: "Missing note." }, { status: 400 });
  if (!body) return NextResponse.json({ error: "Write a note first." }, { status: 400 });
  try {
    const author = await ownerDrawNoteAuthor(id);
    if (author === null) return NextResponse.json({ error: "Note not found." }, { status: 404 });
    if (!canModify(user, author)) return NextResponse.json({ error: "You can only edit your own notes." }, { status: 403 });
    const note = await updateOwnerDrawNote(id, body);
    if (!note) return NextResponse.json({ error: "Note not found." }, { status: 404 });
    return NextResponse.json({ note });
  } catch (e) {
    console.error("[owner-draw-notes] edit failed:", e instanceof Error ? e.message : e);
    return NextResponse.json({ error: "Could not save the edit." }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  const { user, deny } = await gate();
  if (deny) return deny;
  const id = Number(req.nextUrl.searchParams.get("id"));
  if (!Number.isInteger(id) || id <= 0) return NextResponse.json({ error: "Missing note." }, { status: 400 });
  try {
    const author = await ownerDrawNoteAuthor(id);
    if (author === null) return NextResponse.json({ ok: true });
    if (!canModify(user, author)) return NextResponse.json({ error: "You can only delete your own notes." }, { status: 403 });
    await deleteOwnerDrawNote(id);
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("[owner-draw-notes] delete failed:", e instanceof Error ? e.message : e);
    return NextResponse.json({ error: "Could not delete the note." }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const { user, deny } = await gate();
  if (deny) return deny;
  const b = await req.json().catch(() => null);
  const portfolioId = validId(b?.portfolioId) ? b.portfolioId.trim() : "";
  const month = b?.month;
  const name = typeof b?.name === "string" ? b.name.trim().slice(0, 120) : "";
  const body = normalizeNoteBody(b?.body);
  if (!portfolioId || !isMonthKey(month)) return NextResponse.json({ error: "Missing owner or month." }, { status: 400 });
  if (!body) return NextResponse.json({ error: "Write a note first." }, { status: 400 });

  const wantsEmail = b?.emailTo !== undefined && b?.emailTo !== null;
  const picked = resolveRecipients(b?.emailTo, wantsEmail ? await listAccountingStaff() : []);
  if ("error" in picked) return NextResponse.json({ error: "Pick people with Accounting access to email." }, { status: 400 });
  const recipients = picked.emails;

  try {
    const author = user?.name || user?.email || "PM Central";
    const note = await addOwnerDrawNote({ portfolioId, month, body, authorEmail: user?.email ?? "", authorName: author });
    if (recipients.length === 0) return NextResponse.json({ note, emailed: false }, { status: 201 });

    const mail = ownerDrawNoteEmail({
      name: name || `Portfolio ${portfolioId}`,
      month,
      author,
      body,
      appUrl: `${req.nextUrl.origin}/accounting/owner-draws?month=${month}`,
    });
    const sent = await sendEmail({ to: recipients, ...mail, replyTo: user?.email ?? undefined });
    if (!sent.ok) return NextResponse.json({ note, emailed: false, emailError: sent.error }, { status: 201 });
    const emailedTo = recipients.join(", ");
    await markOwnerDrawNoteEmailed(note.id, emailedTo);
    return NextResponse.json({ note: { ...note, emailedTo }, emailed: true }, { status: 201 });
  } catch (e) {
    console.error("[owner-draw-notes] save failed:", e instanceof Error ? e.message : e);
    return NextResponse.json({ error: "Could not save the note." }, { status: 500 });
  }
}
