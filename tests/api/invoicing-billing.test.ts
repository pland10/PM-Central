import { NextRequest } from "next/server";
import { Prisma } from "@prisma/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    invoiceCustomer: { findMany: vi.fn() },
    invoice: { findMany: vi.fn(), create: vi.fn() },
    invoiceSetting: { findUnique: vi.fn() },
  },
}));
vi.mock("@/lib/auth/supabase-server", () => ({ getCurrentUser: vi.fn() }));
vi.mock("@/config/features", () => ({ isFeatureEnabled: vi.fn(() => true) }));

import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth/supabase-server";
import { isFeatureEnabled } from "@/config/features";
import { POST } from "@/app/api/invoicing/billing/route";

const cust = (id: string, over: Record<string, unknown> = {}) => ({
  id,
  billingParty: "pmi",
  name: `Customer ${id}`,
  addr: "1 Main St",
  contact: null,
  attn: null,
  service: "Squatter watch",
  rate: 200,
  frequency: "monthly",
  startDate: "2026-01-01",
  isActive: true,
  ...over,
});

const post = (body: unknown) =>
  POST(
    new NextRequest("https://pmilighthouse.app/api/invoicing/billing", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    })
  );

const create = vi.mocked(prisma.invoice.create);

beforeEach(() => {
  vi.mocked(getCurrentUser).mockResolvedValue({ id: "u1", email: "paul@pmi.com", role: "admin" } as never);
  vi.mocked(prisma.invoiceCustomer.findMany).mockResolvedValue([cust("a"), cust("b"), cust("c", { billingParty: "lms" })] as never);
  // Existing invoices: "a" already billed for Nov; PMI numbers up to 0120, LMS up to 0007.
  vi.mocked(prisma.invoice.findMany).mockImplementation((async (args: { where?: { number?: { startsWith: string } } }) => {
    const prefix = args?.where?.number?.startsWith;
    if (prefix === "PMI-") return [{ number: "PMI-0120" }, { number: "PMI-0099" }];
    if (prefix === "LMS-") return [{ number: "LMS-0007" }];
    return [{ id: "i1", number: "PMI-0120", status: "sent", customerId: "a", periodKey: "2026-11" }];
  }) as never);
  vi.mocked(prisma.invoiceSetting.findUnique).mockResolvedValue({ id: 1, settings: { terms: "Net 15" } } as never);
  create.mockImplementation((async (args: { data: { number: string } }) => ({ id: `new-${args.data.number}`, number: args.data.number })) as never);
});
afterEach(() => vi.clearAllMocks());

describe("POST /api/invoicing/billing", () => {
  it("requires a signed-in user and the invoicing feature", async () => {
    vi.mocked(getCurrentUser).mockResolvedValueOnce(null);
    expect((await post({ period_key: "2026-11" })).status).toBe(401);
    vi.mocked(isFeatureEnabled).mockReturnValueOnce(false);
    expect((await post({ period_key: "2026-11" })).status).toBe(404);
  });

  it("rejects a bad period", async () => {
    expect((await post({ period_key: "Nov" })).status).toBe(400);
  });

  it("creates the missing invoices for the period, numbered per billing party", async () => {
    const res = await post({ period_key: "2026-11" });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.created).toEqual([
      { customerId: "b", id: "new-PMI-0121", number: "PMI-0121" },
      { customerId: "c", id: "new-LMS-0008", number: "LMS-0008" },
    ]);
    expect(body.skipped).toBe(1); // "a" was already invoiced for November

    const data = create.mock.calls[0][0].data as Record<string, unknown>;
    expect(data).toMatchObject({
      number: "PMI-0121",
      customerId: "b",
      periodKey: "2026-11",
      terms: "Net 15",
      items: [{ desc: "Squatter watch", qty: 1, rate: 200 }],
    });
  });

  it("can bill just the customers asked for", async () => {
    const body = await (await post({ period_key: "2026-11", customer_ids: ["c"] })).json();
    expect(body.created.map((c: { customerId: string }) => c.customerId)).toEqual(["c"]);
  });

  it("retries the next number when one is taken meanwhile", async () => {
    create.mockRejectedValueOnce(
      new Prisma.PrismaClientKnownRequestError("dup", { code: "P2002", clientVersion: "6", meta: { target: ["number"] } })
    );
    const body = await (await post({ period_key: "2026-11", customer_ids: ["b"] })).json();
    expect(body.created).toEqual([{ customerId: "b", id: "new-PMI-0122", number: "PMI-0122" }]);
  });
});
