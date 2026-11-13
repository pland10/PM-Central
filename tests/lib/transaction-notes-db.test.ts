import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({ prisma: { $queryRaw: vi.fn(), $executeRawUnsafe: vi.fn().mockResolvedValue(0) } }));

import { prisma } from "@/lib/prisma";
import { transactionNoteSummaries } from "@/lib/transaction-notes-db";

afterEach(() => vi.clearAllMocks());

describe("transactionNoteSummaries", () => {
  it("gives each transaction its note count and newest note", async () => {
    vi.mocked(prisma.$queryRaw).mockResolvedValue([
      { transaction_id: "t1", body: "owner to repay", author_name: "Ann", created_at: new Date("2026-11-13T12:00:00Z"), n: 2 },
    ] as never);
    expect(await transactionNoteSummaries()).toEqual({
      t1: { count: 2, latest: "owner to repay", latestAt: "2026-11-13T12:00:00.000Z", latestBy: "Ann" },
    });
  });

  it("degrades to no notes if the table can't be read (the page still loads)", async () => {
    vi.mocked(prisma.$queryRaw).mockRejectedValue(new Error('relation "transaction_notes" does not exist'));
    expect(await transactionNoteSummaries()).toEqual({});
  });
});
