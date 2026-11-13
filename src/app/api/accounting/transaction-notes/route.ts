import { NextRequest, NextResponse } from "next/server";
import { isFeatureEnabled } from "@/config/features";
import { getCurrentUser } from "@/lib/auth/supabase-server";
import { canAccessAccounting } from "@/lib/accounting-access";
import { listAccountingStaff } from "@/lib/staff";
import { sendEmail } from "@/lib/email";
import { normalizeNoteBody } from "@/lib/work-order-notes";
import { transactionNoteEmail } from "@/lib/transaction-notes";
import {
  addTransactionNote,
  deleteTransactionNote,
  listTransactionNotes,
  markTransactionNoteEmailed,
  transactionForNote,
  transactionNoteAuthor,
  updateTransactionNote,
} from "@/lib/transaction-notes-db";

// Notes on a bank/card transaction (Accounting → Bank Transactions → Notes),
// like the work-order notes. Accounting users only.
//   GET    ?txn=<transaction id>              → notes (newest first) + who can be emailed
//   POST   { transactionId, body, emailTo? }  → save; email only if emailTo is given,
//                                               and only to someone with Accounting access
//   PATCH  { id, body }                       → edit a note (author or an admin)
//   DELETE ?id=<id>                           → delete a note (author or an admin)
export const dynamic = "force-dynamic";

type SessionUser = { email?: string | null; role?: string | null; name?: string | null };
const canModify = (user: SessionUser | null, authorEmail: string) =>
  !user || // Basic-Auth operator (no Supabase user) is the admin
  user.role === "admin" ||
  (!!user.email && !!authorEmail && user.email.toLowerCase() === authorEmail.toLowerCase());

// null = allowed; otherwise the response to send (404 hides the module).
async function gate(): Promise<{ user: SessionUser | null; deny?: NextResponse }> {
  if (!isFeatureEnabled("accounting")) return { user: null, deny: NextResponse.json({ error: "Not found." }, { status: 404 }) };
  const user = await getCurrentUser();
  if (!canAccessAccounting(user)) return { user, deny: NextResponse.json({ error: "Not found." }, { status: 404 }) };
  return { user };
}

export async function GET(req: NextRequest) {
  const { user, deny } = await gate();
  if (deny) return deny;
  const txn = req.nextUrl.searchParams.get("txn") ?? "";
  if (!txn) return NextResponse.json({ error: "Missing transaction." }, { status: 400 });
  try {
    const [notes, staff] = await Promise.all([listTransactionNotes(txn), listAccountingStaff()]);
    return NextResponse.json({
      notes,
      staff,
      assigneeEmail: "",
      me: user?.email ?? "",
      canModerate: !user || user.role === "admin",
    });
  } catch (e) {
    console.error("[txn-notes] list failed:", e instanceof Error ? e.message : e);
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
    const author = await transactionNoteAuthor(id);
    if (author === null) return NextResponse.json({ error: "Note not found." }, { status: 404 });
    if (!canModify(user, author)) return NextResponse.json({ error: "You can only edit your own notes." }, { status: 403 });
    const note = await updateTransactionNote(id, body);
    if (!note) return NextResponse.json({ error: "Note not found." }, { status: 404 });
    return NextResponse.json({ note });
  } catch (e) {
    console.error("[txn-notes] edit failed:", e instanceof Error ? e.message : e);
    return NextResponse.json({ error: "Could not save the edit." }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  const { user, deny } = await gate();
  if (deny) return deny;
  const id = Number(req.nextUrl.searchParams.get("id"));
  if (!Number.isInteger(id) || id <= 0) return NextResponse.json({ error: "Missing note." }, { status: 400 });
  try {
    const author = await transactionNoteAuthor(id);
    if (author === null) return NextResponse.json({ ok: true }); // already gone
    if (!canModify(user, author)) return NextResponse.json({ error: "You can only delete your own notes." }, { status: 403 });
    await deleteTransactionNote(id);
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("[txn-notes] delete failed:", e instanceof Error ? e.message : e);
    return NextResponse.json({ error: "Could not delete the note." }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const { user, deny } = await gate();
  if (deny) return deny;
  const b = await req.json().catch(() => null);
  const transactionId = typeof b?.transactionId === "string" ? b.transactionId : "";
  const body = normalizeNoteBody(b?.body);
  if (!transactionId || !body) return NextResponse.json({ error: "Write a note first." }, { status: 400 });

  const emailTo = typeof b?.emailTo === "string" ? b.emailTo.trim().toLowerCase() : "";
  // Only people with Accounting access — never an arbitrary address.
  const staff = emailTo ? await listAccountingStaff() : [];
  const recipient = emailTo ? staff.find((s) => s.email.toLowerCase() === emailTo) : undefined;
  if (emailTo && !recipient) {
    return NextResponse.json({ error: "Pick someone with Accounting access to email." }, { status: 400 });
  }

  try {
    const txn = await transactionForNote(transactionId);
    if (!txn) return NextResponse.json({ error: "Transaction not found." }, { status: 404 });
    const author = user?.name || user?.email || "PM Central";
    const note = await addTransactionNote({ transactionId, body, authorEmail: user?.email ?? "", authorName: author });
    if (!recipient) return NextResponse.json({ note, emailed: false }, { status: 201 });

    const mail = transactionNoteEmail({ ...txn, author, body, appUrl: `${req.nextUrl.origin}/accounting` });
    const sent = await sendEmail({ to: recipient.email, ...mail, replyTo: user?.email ?? undefined });
    if (!sent.ok) return NextResponse.json({ note, emailed: false, emailError: sent.error }, { status: 201 });
    await markTransactionNoteEmailed(note.id, recipient.email);
    return NextResponse.json({ note: { ...note, emailedTo: recipient.email }, emailed: true }, { status: 201 });
  } catch (e) {
    console.error("[txn-notes] save failed:", e instanceof Error ? e.message : e);
    return NextResponse.json({ error: "Could not save the note." }, { status: 500 });
  }
}
