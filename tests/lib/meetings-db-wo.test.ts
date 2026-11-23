import { afterEach, describe, expect, it, vi } from "vitest";
import { sqlOf } from "../helpers/sql";

const executeRaw = vi.fn().mockResolvedValue(1);
const executeRawUnsafe = vi.fn().mockResolvedValue(0);
const queryRaw = vi.fn();
vi.mock("@/lib/prisma", () => ({
  prisma: {
    $executeRaw: (...a: unknown[]) => executeRaw(...a),
    $executeRawUnsafe: (...a: unknown[]) => executeRawUnsafe(...a),
    $queryRaw: (...a: unknown[]) => queryRaw(...a),
  },
}));

import { setWoNeeded, upsertMeetingNote, woNeededForDate } from "@/lib/meetings-db";

afterEach(() => vi.clearAllMocks());
const sqls = () => executeRaw.mock.calls.map((c) => sqlOf(c[0]));

describe("work order needed flag", () => {
  it("adds the column if needed", async () => {
    await setWoNeeded("p1", "2026-11-23", true);
    expect(executeRawUnsafe.mock.calls.map((c) => c[0]).join("\n")).toMatch(
      /ALTER TABLE meeting_notes ADD COLUMN IF NOT EXISTS wo_needed BOOLEAN NOT NULL DEFAULT false/
    );
  });

  it("ticking it keeps any note and creates the row if there isn't one", async () => {
    await setWoNeeded("p1", "2026-11-23", true);
    expect(sqls()).toEqual([expect.stringMatching(/INSERT INTO meeting_notes .* ON CONFLICT \(property_id, meeting_date\) DO UPDATE SET wo_needed = true/s)]);
  });

  it("unticking it drops a row left with no note", async () => {
    await setWoNeeded("p1", "2026-11-23", false);
    expect(sqls()[0]).toMatch(/UPDATE meeting_notes SET wo_needed = false/);
    expect(sqls()[1]).toMatch(/DELETE FROM meeting_notes WHERE .* AND body = '' AND NOT wo_needed/);
  });

  it("clearing a note keeps a ticked box", async () => {
    await upsertMeetingNote("p1", "2026-11-23", "   ");
    expect(sqls()[0]).toMatch(/UPDATE meeting_notes SET body = ''/);
    expect(sqls()[1]).toMatch(/DELETE FROM meeting_notes WHERE .* AND body = '' AND NOT wo_needed/);
  });

  it("lists the houses ticked for a date", async () => {
    queryRaw.mockResolvedValueOnce([{ property_id: "p1" }, { property_id: "p2" }]);
    expect(await woNeededForDate("2026-11-23")).toEqual(new Set(["p1", "p2"]));
    expect(sqlOf(queryRaw.mock.calls[0][0])).toMatch(/WHERE meeting_date = .* AND wo_needed/);
  });
});
