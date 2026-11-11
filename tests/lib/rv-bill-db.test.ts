import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({ prisma: { $queryRaw: vi.fn() } }));

import { prisma } from "@/lib/prisma";
import { attachBillCandidates, rentvineBillUrl } from "@/lib/rv-bill-db";

const queryRaw = vi.mocked(prisma.$queryRaw);
afterEach(() => {
  vi.clearAllMocks();
  vi.unstubAllEnvs();
});

const txn = (id: string, amount: number, postedDate = "2026-11-07") => ({ transactionId: id, amount, postedDate });

describe("attachBillCandidates", () => {
  it("adds each charge's same-amount Rentvine bill lines from rv_bill_charges", async () => {
    queryRaw.mockResolvedValue([
      {
        transaction_id: "11844",
        bill_id: "2985",
        property_external_id: "36",
        amount: "472.19",
        date_posted: new Date("2026-11-10T00:00:00Z"),
        description: "Village Permit for HVAC",
        payee: "PMI Lighthouse Reimbursable",
        reference: null,
      },
    ] as never);
    const out = await attachBillCandidates([txn("a", 472.19), txn("b", 10)]);
    expect(out[0].rvCandidates).toEqual([
      expect.objectContaining({ kind: "line", billId: "2985", properties: ["36"], date: "2026-11-10", reference: "" }),
    ]);
    expect(out[1].rvCandidates).toEqual([]);
  });

  it("only checks charges from 9/29/2026 on that haven't been archived", async () => {
    queryRaw.mockResolvedValue([
      {
        transaction_id: "1",
        bill_id: "9",
        property_external_id: "36",
        amount: "20.00",
        date_posted: new Date("2026-09-25T00:00:00Z"),
        description: "x",
        payee: "p",
        reference: null,
      },
    ] as never);
    const out = await attachBillCandidates([
      { ...txn("old", 20, "2026-09-20"), archived: false }, // before go-live
      { ...txn("filed", 20, "2026-10-01"), archived: true }, // already archived
      { ...txn("live", 20, "2026-09-29"), archived: false },
    ]);
    expect(out.map((r) => r.rvCandidates === undefined)).toEqual([true, true, false]);
  });

  it("leaves rows without candidates (no status shown) when the table isn't there yet", async () => {
    queryRaw.mockRejectedValue(new Error('relation "rv_bill_charges" does not exist'));
    const out = await attachBillCandidates([txn("a", 472.19)]);
    expect(out[0].rvCandidates).toBeUndefined();
  });

  it("builds the bill link base from the Rentvine subdomain", () => {
    vi.stubEnv("RENTVINE_SUBDOMAIN", "acme");
    expect(rentvineBillUrl()).toBe("https://acme.rentvine.com/accounting/bills/");
  });
});
