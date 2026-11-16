import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({ prisma: {} }));
vi.mock("@/lib/accounting", () => ({ fetchManagementDraws: vi.fn() }));
vi.mock("@/lib/payout-batches", () => ({ batchedPayoutIds: vi.fn() }));
vi.mock("@/lib/notification-prefs-db", () => ({ emailsForCategory: vi.fn() }));
vi.mock("@/lib/push-send", () => ({ sendPushToUser: vi.fn() }));
vi.mock("@/lib/sync-status", () => ({ getSyncStatusMap: vi.fn() }));
vi.mock("@/lib/work-orders-dashboard", () => ({ attentionList: vi.fn(), workOrderAlerts: vi.fn() }));

import { fetchManagementDraws } from "@/lib/accounting";
import { batchedPayoutIds } from "@/lib/payout-batches";
import { livePushAlertDeps } from "@/lib/push-alerts-live";

const draws = vi.mocked(fetchManagementDraws);
const batched = vi.mocked(batchedPayoutIds);
const row = (payoutId: string, amount: number) => ({ payoutId, amount, bankAccount: "Trust", date: "2026-11-16", payee: "PMI Lighthouse", payeeType: "Manager", method: "ACH", checkNumber: "", memo: "" });

afterEach(() => vi.clearAllMocks());

describe("livePushAlertDeps().readyDraws", () => {
  it("returns the Rentvine draws that aren't in a batch yet", async () => {
    draws.mockResolvedValue({ ok: true, rows: [row("a", 100), row("b", 50), row("", 9)], total: 159, count: 3, asOf: "Nov 16" } as never);
    batched.mockResolvedValue(new Set(["a"]));
    expect(await livePushAlertDeps().readyDraws()).toEqual([{ id: "b", amount: 50 }]);
    expect(batched).toHaveBeenCalledWith({}, ["a", "b"]);
  });

  it("returns null (unknown) when Rentvine can't be read or the batch lookup fails", async () => {
    draws.mockResolvedValue({ ok: false, status: 502, error: "down" } as never);
    expect(await livePushAlertDeps().readyDraws()).toBeNull();

    draws.mockResolvedValue({ ok: true, rows: [row("a", 100)], total: 100, count: 1, asOf: "Nov 16" } as never);
    batched.mockRejectedValue(new Error("db busy"));
    expect(await livePushAlertDeps().readyDraws()).toBeNull();
  });
});
