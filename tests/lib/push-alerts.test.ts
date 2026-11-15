import { afterEach, describe, expect, it, vi } from "vitest";
import { runPushAlerts, type PushAlertDeps } from "@/lib/push-alerts";

// Two returned payments and two attention work orders, reused across tests.
const PAY = [
  { id: "rvpay_1", tenant: "Jane Doe", property: "123 Main St", amount: 1250 },
  { id: "rvpay_2", tenant: "Sam Lee", property: "9 Oak Ave", amount: 800 },
];
const WOS = [
  { number: "4567", issue: "Roof leak", property: "123 Main St", priority: "High", link: "/wo/4567", isNew: true, isHigh: true },
  { number: "4568", issue: "Fridge noise", property: "9 Oak Ave", priority: "", link: "/wo/4568", isNew: true, isHigh: false },
];

function makeDeps(over: Partial<PushAlertDeps> = {}): PushAlertDeps {
  return {
    loadSentIds: vi.fn(async () => [] as string[] | null),
    saveSentIds: vi.fn(async () => {}),
    returnedPayments: vi.fn(async () => PAY),
    attentionWorkOrders: vi.fn(async () => WOS),
    recipientsFor: vi.fn(async () => ["admin@pmi.com"]),
    sendPush: vi.fn(async () => ({ sent: 1 })),
    ...over,
  };
}

afterEach(() => vi.clearAllMocks());

describe("runPushAlerts", () => {
  it("seeds silently on the first run (no state yet) and sends nothing", async () => {
    const deps = makeDeps({ loadSentIds: vi.fn(async () => null) });
    const r = await runPushAlerts(deps);
    expect(r.seeded).toBe(true);
    expect(deps.sendPush).not.toHaveBeenCalled();
    // every current key is recorded so only later events notify
    const saved = vi.mocked(deps.saveSentIds).mock.calls[0][0];
    expect(saved).toEqual(expect.arrayContaining(["nsf:rvpay_1", "nsf:rvpay_2", "wo:4567", "wo:4568"]));
  });

  it("notifies admins of new returned payments and new work orders", async () => {
    const deps = makeDeps();
    const r = await runPushAlerts(deps);
    expect(r.nsf).toBe(2);
    expect(r.wo).toBe(2);
    // NSF recipients come from payment_nsf, WO from wo_new
    expect(deps.recipientsFor).toHaveBeenCalledWith("payment_nsf");
    expect(deps.recipientsFor).toHaveBeenCalledWith("wo_new");
    const bodies = vi.mocked(deps.sendPush).mock.calls.map((c) => `${c[1].title} ${c[1].body}`);
    expect(bodies.some((b) => /return|nsf/i.test(b) && b.includes("Jane Doe") && b.includes("1,250"))).toBe(true);
    expect(bodies.some((b) => /urgent/i.test(b) && b.includes("4567"))).toBe(true); // High => urgent wording
    expect(bodies.some((b) => /new work order/i.test(b) && b.includes("4568"))).toBe(true);
  });

  it("does not re-notify items already sent", async () => {
    const deps = makeDeps({ loadSentIds: vi.fn(async () => ["nsf:rvpay_1", "wo:4567"]) });
    const r = await runPushAlerts(deps);
    expect(r.nsf).toBe(1); // only rvpay_2
    expect(r.wo).toBe(1); // only 4568
    const sentTags = vi.mocked(deps.sendPush).mock.calls.map((c) => c[1].tag);
    expect(sentTags).toContain("nsf:rvpay_2");
    expect(sentTags).toContain("wo:4568");
    expect(sentTags).not.toContain("nsf:rvpay_1");
  });

  it("tracks events even when nobody opted in, so a later opt-in gets no backlog", async () => {
    const deps = makeDeps({
      loadSentIds: vi.fn(async () => [] as string[]),
      recipientsFor: vi.fn(async () => []),
    });
    const r = await runPushAlerts(deps);
    expect(r.nsf).toBe(0);
    expect(r.wo).toBe(0);
    expect(deps.sendPush).not.toHaveBeenCalled();
    const saved = vi.mocked(deps.saveSentIds).mock.calls[0][0];
    expect(saved).toEqual(expect.arrayContaining(["nsf:rvpay_1", "wo:4568"]));
  });

  it("prunes aged-out ids: saved state is exactly the current keys", async () => {
    const deps = makeDeps({ loadSentIds: vi.fn(async () => ["nsf:OLD", "wo:OLD", "nsf:rvpay_1"]) });
    await runPushAlerts(deps);
    const saved = vi.mocked(deps.saveSentIds).mock.calls[0][0].sort();
    expect(saved).toEqual(["nsf:rvpay_1", "nsf:rvpay_2", "wo:4567", "wo:4568"].sort());
  });

  it("never throws if a push fails", async () => {
    const deps = makeDeps({ sendPush: vi.fn(async () => { throw new Error("boom"); }) });
    const r = await runPushAlerts(deps);
    expect(r.error ?? "").toBe(""); // swallowed; counts just reflect what landed
  });
});
