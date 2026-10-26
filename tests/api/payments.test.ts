import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({ prisma: { $queryRaw: vi.fn() } }));
vi.mock("@/lib/payments-dashboard", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/payments-dashboard")>()),
  paymentSummaryAsOf: vi.fn(),
}));

import { GET } from "@/app/api/payments/route";
import { paymentSummaryAsOf } from "@/lib/payments-dashboard";

const summary = vi.mocked(paymentSummaryAsOf);
const call = (qs: string) => GET(new NextRequest(`https://pmilighthouse.app/api/payments${qs}`));

beforeEach(() => {
  summary.mockResolvedValue({ asOf: "2026-10-24" } as never);
});

describe("/api/payments", () => {
  it("passes the date and a 7-day range through", async () => {
    expect((await call("?asOf=2026-10-24&days=7")).status).toBe(200);
    expect(summary).toHaveBeenCalledWith("2026-10-24", 7);
  });

  it("defaults to the 1-day view for a missing or odd range", async () => {
    await call("?asOf=2026-10-24");
    await call("?asOf=2026-10-24&days=abc");
    expect(summary.mock.calls.map((c) => c[1])).toEqual([1, 1]);
  });

  it("returns 503 when the payments table isn't there", async () => {
    summary.mockResolvedValue(null);
    expect((await call("")).status).toBe(503);
  });
});
