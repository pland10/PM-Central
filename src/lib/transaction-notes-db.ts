import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { ensurePlaidAnnotationColumns } from "@/lib/plaid-sync";
import type { WorkOrderNote as Note } from "@/lib/work-order-notes";
import type { NoteSummary } from "@/lib/work-order-notes-db";

// Storage for transaction notes (Bank Transactions → Notes). The table lives
// with the other plaid_transactions annotations (created + old Notes copied in
// by ensurePlaidAnnotationColumns in src/lib/plaid-sync.ts; documented in
// prisma/sql/plaid.sql). Same note shape as work-order notes.

type RawNote = {
  id: number;
  body: string;
  author_name: string | null;
  author_email: string | null;
  created_at: Date | null;
  edited_at: Date | null;
  emailed_to: string | null;
};
const COLS = Prisma.sql`id, body, author_name, author_email, created_at, edited_at, emailed_to`;
const toNote = (r: RawNote): Note => ({
  id: Number(r.id),
  body: r.body,
  authorName: r.author_name ?? "",
  authorEmail: r.author_email ?? "",
  createdAt: r.created_at ? new Date(r.created_at).toISOString() : "",
  editedAt: r.edited_at ? new Date(r.edited_at).toISOString() : null,
  emailedTo: r.emailed_to ?? null,
});

const ready = () => ensurePlaidAnnotationColumns(prisma);

export async function listTransactionNotes(transactionId: string): Promise<Note[]> {
  await ready();
  const rows = await prisma.$queryRaw<RawNote[]>(Prisma.sql`
    SELECT ${COLS} FROM transaction_notes WHERE transaction_id = ${transactionId}
    ORDER BY created_at DESC, id DESC`);
  return rows.map(toNote);
}

// The author's email for one note (for authorizing an edit/delete); null if the
// note is gone. "" for the copied-in "Earlier note"s (admins only).
export async function transactionNoteAuthor(id: number): Promise<string | null> {
  await ready();
  const rows = await prisma.$queryRaw<{ author_email: string | null }[]>(Prisma.sql`
    SELECT author_email FROM transaction_notes WHERE id = ${id}`);
  return rows.length ? (rows[0].author_email ?? "") : null;
}

export async function updateTransactionNote(id: number, body: string): Promise<Note | null> {
  await ready();
  const rows = await prisma.$queryRaw<RawNote[]>(Prisma.sql`
    UPDATE transaction_notes SET body = ${body}, edited_at = now() WHERE id = ${id}
    RETURNING ${COLS}`);
  return rows.length ? toNote(rows[0]) : null;
}

export async function deleteTransactionNote(id: number): Promise<boolean> {
  await ready();
  return (await prisma.$executeRaw(Prisma.sql`DELETE FROM transaction_notes WHERE id = ${id}`)) > 0;
}

export async function addTransactionNote(n: {
  transactionId: string;
  body: string;
  authorEmail: string;
  authorName: string;
}): Promise<Note> {
  await ready();
  const rows = await prisma.$queryRaw<RawNote[]>(Prisma.sql`
    INSERT INTO transaction_notes (transaction_id, body, author_email, author_name)
    VALUES (${n.transactionId}, ${n.body}, ${n.authorEmail}, ${n.authorName})
    RETURNING ${COLS}`);
  return toNote(rows[0]);
}

export async function markTransactionNoteEmailed(id: number, to: string): Promise<void> {
  await prisma.$executeRaw(Prisma.sql`
    UPDATE transaction_notes SET emailed_to = ${to}, emailed_at = now() WHERE id = ${id}`);
}

// The charge a note is about, for the email (null if it doesn't exist).
export async function transactionForNote(transactionId: string): Promise<{
  date: string | null;
  merchant: string;
  account: string;
  amount: number;
  property: string;
} | null> {
  await ready();
  const rows = await prisma.$queryRaw<
    {
      posted_date: Date | null;
      merchant_name: string | null;
      name: string | null;
      account_name: string | null;
      amount: unknown;
      property_external_id: string | null;
    }[]
  >(Prisma.sql`
    SELECT posted_date, merchant_name, name, account_name, amount, property_external_id
    FROM plaid_transactions WHERE transaction_id = ${transactionId}`);
  const r = rows[0];
  if (!r) return null;
  let property = "";
  if (r.property_external_id) {
    const p = await prisma.property
      .findFirst({ where: { externalId: r.property_external_id }, select: { name: true, street1: true, city: true } })
      .catch(() => null);
    if (p) property = [p.name || p.street1, p.city].filter(Boolean).join(" · ");
  }
  return {
    date: r.posted_date ? new Date(r.posted_date).toISOString().slice(0, 10) : null,
    merchant: r.merchant_name || r.name || "",
    account: r.account_name ?? "",
    amount: Number(r.amount ?? 0),
    property,
  };
}

// Per transaction: how many notes and the newest one, for the Notes column.
// Empty if the table can't be read.
export async function transactionNoteSummaries(): Promise<Record<string, NoteSummary>> {
  try {
    await ready();
    const rows = await prisma.$queryRaw<
      { transaction_id: string; body: string; author_name: string | null; created_at: Date; n: number }[]
    >(Prisma.sql`
      SELECT DISTINCT ON (transaction_id) transaction_id, body, author_name, created_at,
             COUNT(*) OVER (PARTITION BY transaction_id)::int AS n
      FROM transaction_notes
      ORDER BY transaction_id, created_at DESC, id DESC`);
    return Object.fromEntries(
      rows.map((r) => [
        r.transaction_id,
        { count: Number(r.n), latest: r.body, latestAt: new Date(r.created_at).toISOString(), latestBy: r.author_name ?? "" },
      ])
    );
  } catch {
    return {};
  }
}
