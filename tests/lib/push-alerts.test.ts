import { afterEach, describe, expect, it, vi } from "vitest";
import { runPushAlerts, type PushAlertDeps } from "@/lib/push-alerts";

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
    staleSyncs: vi.fn(async () => []),
    assignedWorkOrderStages: vi.fn(async () => []),
    recipientsFor: vi.fn(async () => ["admin@pmi.com"]),
    sendPush: vi.fn(async () => ({ sent: 1 })),
    ...over,
  };
}

afterEach(() => vi.clearAllMocks());

describe("runPushAlerts — payments & new work orders", () => {
  it("seeds silently on the first run (no state yet) and sends nothing", async () => {
    const deps = makeDeps({ loadSentIds: vi.fn(async () => null) });
    const r = await runPushAlerts(deps);
    expect(r.seeded).toBe(true);
    expect(deps.sendPush).not.toHaveBeenCalled();
    const saved = vi.mocked(deps.saveSentIds).mock.calls[0][0];
    expect(saved).toEqual(expect.arrayContaining(["nsf:rvpay_1", "nsf:rvpay_2", "wo:4567", "wo:4568"]));
  });

  it("notifies admins of new returned payments and new work orders", async () => {
    const deps = makeDeps();
    const r = await runPushAlerts(deps);
    expect(r.nsf).toBe(2);
    expect(r.wo).toBe(2);
    expect(deps.recipientsFor).toHaveBeenCalledWith("payment_nsf");
    expect(deps.recipientsFor).toHaveBeenCalledWith("wo_new");
    const bodies = vi.mocked(deps.sendPush).mock.calls.map((c) => `${c[1].title} ${c[1].body}`);
    expect(bodies.some((b) => /return|nsf/i.test(b) && b.includes("Jane Doe") && b.includes("1,250"))).toBe(true);
    expect(bodies.some((b) => /urgent/i.test(b) && b.includes("4567"))).toBe(true);
    expect(bodies.some((b) => /new work order/i.test(b) && b.includes("4568"))).toBe(true);
  });

  it("does not re-notify items already sent", async () => {
    const deps = makeDeps({ loadSentIds: vi.fn(async () => ["nsf:rvpay_1", "wo:4567"]) });
    const r = await runPushAlerts(deps);
    expect(r.nsf).toBe(1);
    expect(r.wo).toBe(1);
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
    expect(r.error ?? "").toBe("");
  });
});

describe("runPushAlerts — sync failures", () => {
  const STALE = [{ id: "payments", label: "Payments & settlements", cadence: "Every 2h", lastRun: "2026-11-15T00:00:00Z" }];

  it("notifies sync_failure subscribers when a sync goes stale, once per episode", async () => {
    const deps = makeDeps({
      returnedPayments: vi.fn(async () => []),
      attentionWorkOrders: vi.fn(async () => []),
      staleSyncs: vi.fn(async () => STALE),
      recipientsFor: vi.fn(async (c: string) => (c === "sync_failure" ? ["admin@pmi.com"] : [])),
    });
    const r = await runPushAlerts(deps);
    expect(r.sync).toBe(1);
    expect(deps.recipientsFor).toHaveBeenCalledWith("sync_failure");
    const [, payload] = vi.mocked(deps.sendPush).mock.calls[0];
    expect(payload.tag).toBe("sync:payments");
    expect(`${payload.title} ${payload.body}`).toMatch(/Payments & settlements/);

    // Second run while still stale: already in state → no repeat.
    const deps2 = makeDeps({
      loadSentIds: vi.fn(async () => ["sync:payments"]),
      returnedPayments: vi.fn(async () => []),
      attentionWorkOrders: vi.fn(async () => []),
      staleSyncs: vi.fn(async () => STALE),
      recipientsFor: vi.fn(async () => ["admin@pmi.com"]),
    });
    const r2 = await runPushAlerts(deps2);
    expect(r2.sync).toBe(0);
    expect(deps2.sendPush).not.toHaveBeenCalled();
  });

  it("re-arms once a stale sync recovers (key pruned)", async () => {
    const deps = makeDeps({
      loadSentIds: vi.fn(async () => ["sync:payments"]),
      returnedPayments: vi.fn(async () => []),
      attentionWorkOrders: vi.fn(async () => []),
      staleSyncs: vi.fn(async () => []), // recovered
      recipientsFor: vi.fn(async () => ["admin@pmi.com"]),
    });
    await runPushAlerts(deps);
    const saved = vi.mocked(deps.saveSentIds).mock.calls[0][0];
    expect(saved).not.toContain("sync:payments"); // pruned → will alert again if it refails
  });
});

describe("runPushAlerts — assigned work order updated (stage change)", () => {
  const WO = { woId: "999", number: "4567", stage: "Scheduled", issue: "Roof leak", techEmail: "ari@pmi.com" };

  it("pushes the assigned tech when the stage changes, if they opted into wo_assigned", async () => {
    const deps = makeDeps({
      loadSentIds: vi.fn(async () => ["wostage:999:Open"]), // was Open, now Scheduled
      returnedPayments: vi.fn(async () => []),
      attentionWorkOrders: vi.fn(async () => []),
      assignedWorkOrderStages: vi.fn(async () => [WO]),
      recipientsFor: vi.fn(async (c: string) => (c === "wo_assigned" ? ["ari@pmi.com"] : [])),
    });
    const r = await runPushAlerts(deps);
    expect(r.updates).toBe(1);
    const [emails, payload] = vi.mocked(deps.sendPush).mock.calls[0];
    expect(emails).toEqual(["ari@pmi.com"]);
    expect(`${payload.title} ${payload.body}`).toMatch(/4567/);
    expect(payload.body).toMatch(/Scheduled/);
  });

  it("does not notify on first observation (no prior stage recorded)", async () => {
    const deps = makeDeps({
      loadSentIds: vi.fn(async () => []), // nothing seen before
      returnedPayments: vi.fn(async () => []),
      attentionWorkOrders: vi.fn(async () => []),
      assignedWorkOrderStages: vi.fn(async () => [WO]),
      recipientsFor: vi.fn(async () => ["ari@pmi.com"]),
    });
    const r = await runPushAlerts(deps);
    expect(r.updates).toBe(0);
    expect(deps.sendPush).not.toHaveBeenCalled();
    // but it records the current stage so the next change notifies
    expect(vi.mocked(deps.saveSentIds).mock.calls[0][0]).toContain("wostage:999:Scheduled");
  });

  it("does not notify a tech who hasn't opted in", async () => {
    const deps = makeDeps({
      loadSentIds: vi.fn(async () => ["wostage:999:Open"]),
      returnedPayments: vi.fn(async () => []),
      attentionWorkOrders: vi.fn(async () => []),
      assignedWorkOrderStages: vi.fn(async () => [WO]),
      recipientsFor: vi.fn(async () => []), // nobody opted in
    });
    const r = await runPushAlerts(deps);
    expect(r.updates).toBe(0);
    expect(deps.sendPush).not.toHaveBeenCalled();
  });
});
