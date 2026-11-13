import { describe, expect, it, vi } from "vitest";
import type { PrismaClient } from "@prisma/client";
import { ensurePlaidAnnotationColumns } from "@/lib/plaid-sync";

describe("transaction notes storage", () => {
  it("is created with the other annotation columns, and old Notes text is copied in once", async () => {
    const run = vi.fn().mockResolvedValue(0);
    await ensurePlaidAnnotationColumns({ $executeRawUnsafe: run } as unknown as PrismaClient);
    const sql = run.mock.calls.map((c) => String(c[0]).replace(/\s+/g, " "));

    expect(sql.some((s) => /CREATE TABLE IF NOT EXISTS transaction_notes/.test(s))).toBe(true);
    expect(sql.some((s) => /ADD COLUMN IF NOT EXISTS notes_migrated/.test(s))).toBe(true);

    // The copy marks each row as it moves it (one statement), so it never runs
    // twice for a row and a note someone deleted never comes back.
    const copy = sql.find((s) => /INSERT INTO transaction_notes/.test(s))!;
    expect(copy).toMatch(/UPDATE plaid_transactions SET notes_migrated = true/);
    expect(copy).toMatch(/WHERE notes_migrated = false/);
    // The copy runs after the table and the flag column exist.
    const order = (re: RegExp) => sql.findIndex((s) => re.test(s));
    expect(order(/INSERT INTO transaction_notes/)).toBeGreaterThan(order(/CREATE TABLE IF NOT EXISTS transaction_notes/));
    expect(order(/INSERT INTO transaction_notes/)).toBeGreaterThan(order(/notes_migrated BOOLEAN/));
  });
});
