import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import type { DrawRecord, DrawSnapshot } from "@/lib/owner-draws";

// Storage for Owner Draws (see ./owner-draws.ts, prisma/sql/owner-draws.sql):
// one app-owned row per portfolio per month — the month's edits to Rentvine's
// numbers, the coordinator's note, who approved / marked it paid, and the
// Rentvine figures frozen at approval. Created on first use.

const DDL = [
  `CREATE TABLE IF NOT EXISTS owner_draws (
     month            TEXT NOT NULL,
     portfolio_id     TEXT NOT NULL,
     balance_override NUMERIC(12,2),
     reserve_override NUMERIC(12,2),
     unpaid_override  NUMERIC(12,2),
     note             TEXT NOT NULL DEFAULT '',
     approved_at      TIMESTAMPTZ,
     approved_by      TEXT,
     paid_at          TIMESTAMPTZ,
     paid_by          TEXT,
     snapshot         JSONB,
     updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
     updated_by       TEXT,
     PRIMARY KEY (month, portfolio_id)
   )`,
];

let tables: Promise<void> | null = null;
export function ensureOwnerDrawTables(): Promise<void> {
  if (!tables) {
    tables = (async () => {
      for (const sql of DDL) await prisma.$executeRawUnsafe(sql);
    })().catch((e) => {
      tables = null; // let a later call retry
      throw e;
    });
  }
  return tables;
}

type Row = {
  portfolio_id: string;
  balance_override: unknown;
  reserve_override: unknown;
  unpaid_override: unknown;
  note: string;
  approved_at: Date | null;
  approved_by: string | null;
  paid_at: Date | null;
  paid_by: string | null;
  snapshot: unknown;
};

const num = (v: unknown): number | null => (v == null ? null : Number(v));
const iso = (d: Date | null): string | null => (d ? new Date(d).toISOString() : null);

function toRecord(r: Row): DrawRecord {
  return {
    portfolioId: r.portfolio_id,
    balanceOverride: num(r.balance_override),
    reserveOverride: num(r.reserve_override),
    unpaidOverride: num(r.unpaid_override),
    note: r.note ?? "",
    approvedAt: iso(r.approved_at),
    approvedBy: r.approved_by,
    paidAt: iso(r.paid_at),
    paidBy: r.paid_by,
    snapshot: r.snapshot && typeof r.snapshot === "object" ? (r.snapshot as DrawSnapshot) : null,
  };
}

const COLS = Prisma.sql`portfolio_id, balance_override, reserve_override, unpaid_override, note,
  approved_at, approved_by, paid_at, paid_by, snapshot`;

export async function listDrawRecords(month: string): Promise<DrawRecord[]> {
  await ensureOwnerDrawTables();
  const rows = await prisma.$queryRaw<Row[]>(Prisma.sql`SELECT ${COLS} FROM owner_draws WHERE month = ${month}`);
  return rows.map(toRecord);
}

export async function getDrawRecord(month: string, portfolioId: string): Promise<DrawRecord | null> {
  await ensureOwnerDrawTables();
  const rows = await prisma.$queryRaw<Row[]>(
    Prisma.sql`SELECT ${COLS} FROM owner_draws WHERE month = ${month} AND portfolio_id = ${portfolioId}`
  );
  return rows[0] ? toRecord(rows[0]) : null;
}

export type DrawField = "balance" | "reserve" | "unpaid";
const FIELD_COLUMN: Record<DrawField, Prisma.Sql> = {
  balance: Prisma.raw("balance_override"),
  reserve: Prisma.raw("reserve_override"),
  unpaid: Prisma.raw("unpaid_override"),
};

// Edit (or reset, with null) one of the month's numbers. Changing a number
// takes back an approval — the approved amount is no longer the one on screen.
export async function setDrawOverride(
  month: string,
  portfolioId: string,
  field: DrawField,
  value: number | null,
  by: string
): Promise<void> {
  await ensureOwnerDrawTables();
  const col = FIELD_COLUMN[field];
  await prisma.$executeRaw(Prisma.sql`
    INSERT INTO owner_draws (month, portfolio_id, ${col}, updated_by)
    VALUES (${month}, ${portfolioId}, ${value}::numeric, ${by})
    ON CONFLICT (month, portfolio_id) DO UPDATE
       SET ${col} = EXCLUDED.${col},
           approved_at = NULL, approved_by = NULL,
           snapshot = CASE WHEN owner_draws.paid_at IS NULL THEN NULL ELSE owner_draws.snapshot END,
           updated_at = now(), updated_by = EXCLUDED.updated_by`);
}

export async function setDrawNote(month: string, portfolioId: string, note: string, by: string): Promise<void> {
  await ensureOwnerDrawTables();
  await prisma.$executeRaw(Prisma.sql`
    INSERT INTO owner_draws (month, portfolio_id, note, updated_by)
    VALUES (${month}, ${portfolioId}, ${note}, ${by})
    ON CONFLICT (month, portfolio_id) DO UPDATE
       SET note = EXCLUDED.note, updated_at = now(), updated_by = EXCLUDED.updated_by`);
}

// Approve / mark paid (on = true) or undo it. Turning either on freezes the
// Rentvine figures (keeping an existing snapshot); when both are off again the
// row goes back to live numbers.
export async function setDrawStatus(
  month: string,
  portfolioId: string,
  kind: "approved" | "paid",
  on: boolean,
  by: string,
  snapshot: DrawSnapshot | null
): Promise<void> {
  await ensureOwnerDrawTables();
  const at = Prisma.raw(kind === "approved" ? "approved_at" : "paid_at");
  const who = Prisma.raw(kind === "approved" ? "approved_by" : "paid_by");
  const other = Prisma.raw(kind === "approved" ? "paid_at" : "approved_at");
  const snap = snapshot ? JSON.stringify(snapshot) : null;
  if (on) {
    await prisma.$executeRaw(Prisma.sql`
      INSERT INTO owner_draws (month, portfolio_id, ${at}, ${who}, snapshot, updated_by)
      VALUES (${month}, ${portfolioId}, now(), ${by}, ${snap}::jsonb, ${by})
      ON CONFLICT (month, portfolio_id) DO UPDATE
         SET ${at} = now(), ${who} = EXCLUDED.${who},
             snapshot = COALESCE(owner_draws.snapshot, EXCLUDED.snapshot),
             updated_at = now(), updated_by = EXCLUDED.updated_by`);
  } else {
    await prisma.$executeRaw(Prisma.sql`
      UPDATE owner_draws
         SET ${at} = NULL, ${who} = NULL,
             snapshot = CASE WHEN ${other} IS NULL THEN NULL ELSE snapshot END,
             updated_at = now(), updated_by = ${by}
       WHERE month = ${month} AND portfolio_id = ${portfolioId}`);
  }
}

// Months that have saved rows, newest first (for the month picker).
export async function listDrawMonths(limit = 24): Promise<string[]> {
  await ensureOwnerDrawTables();
  const rows = await prisma.$queryRaw<{ month: string }[]>(
    Prisma.sql`SELECT DISTINCT month FROM owner_draws ORDER BY month DESC LIMIT ${limit}::int`
  );
  return rows.map((r) => r.month);
}
