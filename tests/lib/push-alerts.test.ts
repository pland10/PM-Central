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
    readyDraws: vi.fn(async () => null),
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

describe("runPushAlerts — rent batch ready to draw (batch_ready)", () => {
  const DRAWS = [
    { id: "po_1", amount: 1200 },
    { id: "po_2", amount: 300.5 },
  ];
  const onlyDraws = (over: Partial<PushAlertDeps> = {}) =>
    makeDeps({ returnedPayments: vi.fn(async () => []), attentionWorkOrders: vi.fn(async () => []), ...over });
  const saved = (deps: PushAlertDeps) => vi.mocked(deps.saveSentIds).mock.calls[0][0];

  it("starts tracking silently the first time (no backlog blast)", async () => {
    const deps = onlyDraws({ readyDraws: vi.fn(async () => DRAWS) });
    const r = await runPushAlerts(deps);
    expect(r.draws).toBe(0);
    expect(deps.sendPush).not.toHaveBeenCalled();
    expect(saved(deps)).toEqual(expect.arrayContaining(["draws:tracking", "draw:po_1", "draw:po_2"]));
  });

  it("sends one summary when new draws are ready to batch", async () => {
    const deps = onlyDraws({
      loadSentIds: vi.fn(async () => ["draws:tracking", "draw:po_1"]),
      readyDraws: vi.fn(async () => [...DRAWS, { id: "po_3", amount: 99.5 }]),
    });
    const r = await runPushAlerts(deps);
    expect(r.draws).toBe(1);
    expect(deps.recipientsFor).toHaveBeenCalledWith("batch_ready");
    expect(deps.sendPush).toHaveBeenCalledTimes(1);
    const [, payload] = vi.mocked(deps.sendPush).mock.calls[0];
    expect(payload.title).toMatch(/ready to batch/i);
    expect(payload.body).toContain("2 new"); // po_2 + po_3
    expect(payload.body).toContain("$400"); // 300.50 + 99.50
    expect(payload.body).toContain("$1,600"); // all 3 ready
    expect(payload.url).toBe("/accounting/rentvine");
    expect(saved(deps)).toEqual(expect.arrayContaining(["draws:tracking", "draw:po_1", "draw:po_2", "draw:po_3"]));
  });

  it("doesn't re-notify draws already announced, and forgets ones that got batched", async () => {
    const deps = onlyDraws({
      loadSentIds: vi.fn(async () => ["draws:tracking", "draw:po_1", "draw:po_2"]),
      readyDraws: vi.fn(async () => [DRAWS[1]]), // po_1 was batched
    });
    const r = await runPushAlerts(deps);
    expect(r.draws).toBe(0);
    expect(deps.sendPush).not.toHaveBeenCalled();
    expect(saved(deps)).toEqual(expect.arrayContaining(["draws:tracking", "draw:po_2"]));
    expect(saved(deps)).not.toContain("draw:po_1");
  });

  it("doesn't check Rentvine when nobody wants the alert, and keeps what it knew", async () => {
    const readyDraws = vi.fn(async () => DRAWS);
    const deps = onlyDraws({
      loadSentIds: vi.fn(async () => ["draws:tracking", "draw:po_1"]),
      readyDraws,
      recipientsFor: vi.fn(async (c: string) => (c === "batch_ready" ? [] : ["admin@pmi.com"])),
    });
    await runPushAlerts(deps);
    expect(readyDraws).not.toHaveBeenCalled();
    expect(saved(deps)).toEqual(expect.arrayContaining(["draws:tracking", "draw:po_1"]));
  });

  it("keeps what it knew (no false alert later) when Rentvine can't be read", async () => {
    const deps = onlyDraws({
      loadSentIds: vi.fn(async () => ["draws:tracking", "draw:po_1"]),
      readyDraws: vi.fn(async () => null),
    });
    const r = await runPushAlerts(deps);
    expect(r.draws).toBe(0);
    expect(saved(deps)).toEqual(expect.arrayContaining(["draws:tracking", "draw:po_1"]));
  });
});

