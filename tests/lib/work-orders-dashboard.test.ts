import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { routeQueries, sqlOf } from "../helpers/sql";

vi.mock("@/lib/prisma", () => ({
  prisma: { $queryRaw: vi.fn(), property: { findMany: vi.fn() } },
}));

import { prisma } from "@/lib/prisma";
import {
  attentionList,
  listWorkOrders,
  workOrderAlerts,
  workOrderStageSummary,
  type WoAlert,
  type WorkOrderAlerts,
} from "@/lib/work-orders-dashboard";

const queryRaw = vi.mocked(prisma.$queryRaw);
const findMany = vi.mocked(prisma.property.findMany);

const NOW = new Date("2026-10-24T12:00:00Z").getTime();
const hoursAgo = (h: number) => new Date(NOW - h * 3_600_000);

function woRow(over: Record<string, unknown> = {}) {
  return {
    source_id: "ls-1",
    wo_number: "100",
    title: "Leaking sink",
    name: null,
    stage: "Troubleshooting",
    property_address: "1 Main St",
    vendor_name: "Acme Plumbing",
    assignee_name: "Pat",
    link: "https://app.leadsimple.com/p/1",
    created_at: hoursAgo(1),
    closed_at: null,
    ...over,
  };
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW);
  findMany.mockResolvedValue([{ id: "prop-a", externalId: "pmilighthouse:property:12" }] as never);
});

afterEach(() => {
  vi.useRealTimers();
});

describe("workOrderStageSummary", () => {
  it("counts open work orders by LeadSimple closed_at, not the stage name alone", async () => {
    queryRaw.mockImplementation(
      routeQueries([
        [
          /FROM work_orders GROUP BY stage/,
          [
            { stage: "Troubleshooting", open_count: 3, total_count: 3 },
            // closed in LeadSimple but stuck in a non-terminal-named stage
            { stage: "Invoice Received", open_count: 1, total_count: 6 },
            { stage: "Completed", open_count: 2, total_count: 9 },
            { stage: "New WO", open_count: 0, total_count: 4 },
            { stage: null, open_count: 5, total_count: 5 },
          ],
        ],
      ]) as never
    );

    const summary = await workOrderStageSummary();

    expect(summary).not.toBeNull();
    expect(summary!.openTotal).toBe(4); // 3 + 1; "Completed" is terminal by name
    expect(summary!.total).toBe(22); // every named stage, open or not
    expect(summary!.stages).toEqual([
      { stage: "Invoice Received", count: 1 },
      { stage: "Troubleshooting", count: 3 },
    ]); // latest pipeline stage first; zero-open and terminal stages dropped
  });

  it("counts 'Work Completed - Awaiting Invoice' as an open stage", async () => {
    queryRaw.mockImplementation(
      routeQueries([
        [
          /FROM work_orders GROUP BY stage/,
          [
            { stage: "Work Completed - Awaiting Invoice", open_count: 4, total_count: 7 },
            { stage: "Troubleshooting", open_count: 2, total_count: 2 },
          ],
        ],
      ]) as never
    );

    const summary = await workOrderStageSummary();

    expect(summary!.openTotal).toBe(6);
    expect(summary!.stages).toEqual([
      { stage: "Work Completed - Awaiting Invoice", count: 4 },
      { stage: "Troubleshooting", count: 2 },
    ]);
  });

  it("returns null when the work_orders table is missing", async () => {
    queryRaw.mockRejectedValue(new Error('relation "work_orders" does not exist'));
    expect(await workOrderStageSummary()).toBeNull();
  });
});

describe("workOrderAlerts", () => {
  function setup(rows: unknown[], rv: unknown[] = []) {
    queryRaw.mockImplementation(
      routeQueries([
        [/FROM rv_work_orders/, rv],
        [/FROM work_orders/, rows],
      ]) as never
    );
  }

  it("lists open work orders created within the window, newest first", async () => {
    setup([
      woRow({ source_id: "a", wo_number: "1", created_at: hoursAgo(80) }), // too old
      woRow({ source_id: "b", wo_number: "2", created_at: hoursAgo(10) }),
      woRow({ source_id: "c", wo_number: "3", created_at: hoursAgo(2) }),
    ]);

    const alerts = await workOrderAlerts(72);

    expect(alerts!.recent.map((a) => a.number)).toEqual(["3", "2"]);
    expect(alerts!.windowHours).toBe(72);
  });

  it("excludes work orders closed in LeadSimple even in a non-terminal stage", async () => {
    setup([
      woRow({ wo_number: "1", stage: "Invoice Received", closed_at: hoursAgo(1) }),
      woRow({ wo_number: "2", stage: "Completed" }),
      woRow({ wo_number: "3", stage: "Troubleshooting" }),
    ]);

    const alerts = await workOrderAlerts();

    expect(alerts!.recent.map((a) => a.number)).toEqual(["3"]);
  });

  it("keeps an 'Awaiting Invoice' work order in the open alerts", async () => {
    setup([woRow({ wo_number: "7", stage: "Work Completed - Awaiting Invoice" })]);

    const alerts = await workOrderAlerts();

    expect(alerts!.recent.map((a) => a.number)).toEqual(["7"]);
  });

  it("flags High priority from the Rentvine enrichment and links the property", async () => {
    setup(
      [
        woRow({ wo_number: "7", created_at: hoursAgo(500) }),
        woRow({ wo_number: "8", created_at: hoursAgo(1) }),
      ],
      [
        { wo_number: "7", property_external_id: "pmilighthouse:property:12", priority: "High" },
        { wo_number: "8", property_external_id: null, priority: "Low" },
      ]
    );

    const alerts = await workOrderAlerts();

    expect(alerts!.high).toHaveLength(1);
    expect(alerts!.high[0]).toMatchObject({ number: "7", priority: "High", propertyId: "prop-a" });
    expect(alerts!.recent[0]).toMatchObject({ number: "8", priority: "Low", propertyId: null });
  });

  it("still works when the Rentvine enrichment table is missing", async () => {
    queryRaw.mockImplementation(
      routeQueries([
        [/FROM rv_work_orders/, new Error("no table")],
        [/FROM work_orders/, [woRow({ wo_number: "9" })]],
      ]) as never
    );

    const alerts = await workOrderAlerts();

    expect(alerts!.recent[0]).toMatchObject({ number: "9", priority: "", propertyId: null });
  });

  it("falls back to the process name, then a generic label, for the issue", async () => {
    setup([
      woRow({ wo_number: "1", title: null, name: "Gutter cleaning" }),
      woRow({ wo_number: "2", title: null, name: null, created_at: hoursAgo(2) }),
    ]);

    const alerts = await workOrderAlerts();

    expect(alerts!.recent.map((a) => a.issue)).toEqual(["Gutter cleaning", "Work order"]);
  });

  it("returns null when the work_orders table is missing", async () => {
    queryRaw.mockImplementation(
      routeQueries([
        [/FROM rv_work_orders/, []],
        [/FROM work_orders/, new Error("no table")],
      ]) as never
    );
    expect(await workOrderAlerts()).toBeNull();
  });
});

describe("attentionList", () => {
  const alert = (number: string, over: Partial<WoAlert> = {}): WoAlert => ({
    number,
    issue: "Issue",
    property: "1 Main St",
    stage: "Troubleshooting",
    priority: "",
    propertyId: null,
    link: "",
    createdAt: hoursAgo(1).toISOString(),
    ...over,
  });
  const alerts = (recent: WoAlert[], high: WoAlert[]): WorkOrderAlerts => ({ recent, high, windowHours: 72 });

  it("returns an empty list when there are no alerts", () => {
    expect(attentionList(null)).toEqual([]);
  });

  it("merges a work order that is both new and High into one entry", () => {
    const both = alert("5", { priority: "High" });
    const list = attentionList(alerts([both], [both]));

    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ number: "5", isNew: true, isHigh: true });
  });

  it("marks recent-only and high-only work orders correctly", () => {
    const list = attentionList(
      alerts([alert("1", { priority: "Low" })], [alert("2", { priority: "High" })])
    );

    expect(list.find((w) => w.number === "1")).toMatchObject({ isNew: true, isHigh: false });
    expect(list.find((w) => w.number === "2")).toMatchObject({ isNew: false, isHigh: true });
  });

  it("sorts High first, then newest first, with undated last", () => {
    const list = attentionList(
      alerts(
        [
          alert("old", { createdAt: hoursAgo(50).toISOString() }),
          alert("new", { createdAt: hoursAgo(1).toISOString() }),
          alert("undated", { createdAt: null }),
        ],
        [alert("urgent", { priority: "High", createdAt: hoursAgo(300).toISOString() })]
      )
    );

    expect(list.map((w) => w.number)).toEqual(["urgent", "new", "old", "undated"]);
  });
});

describe("listWorkOrders", () => {
  it("marks closed_at rows terminal and merges priority, property link and latest update", async () => {
    queryRaw.mockImplementation(
      routeQueries([
        [/FROM rv_work_orders/, [{ wo_number: "100", property_external_id: "pmilighthouse:property:12", priority: "High" }]],
        [
          /FROM activities/,
          [
            { deal_name: "Work Order #100", content: "Vendor on site\n\nFrom: Pat", created_at: hoursAgo(1) },
            { deal_name: "Work Order #100", content: "Older note", created_at: hoursAgo(5) },
          ],
        ],
        [
          /FROM work_orders/,
          [
            woRow({ source_id: "a", wo_number: "100" }),
            woRow({ source_id: "b", wo_number: "200", stage: "Invoice Received", closed_at: hoursAgo(3) }),
            woRow({ source_id: "c", wo_number: null, stage: null }),
          ],
        ],
      ]) as never
    );

    const rows = await listWorkOrders();

    expect(rows).toHaveLength(3);
    expect(rows![0]).toMatchObject({
      id: "a",
      number: "100",
      terminal: false,
      priority: "High",
      propertyId: "prop-a",
      lastUpdate: "Vendor on site", // newest note, "From:" trailer stripped
    });
    expect(rows![1]).toMatchObject({ id: "b", terminal: true }); // closed in LeadSimple
    expect(rows![2]).toMatchObject({ id: "c", number: "—", stage: "—", lastUpdate: "", lastUpdateAt: null });
  });

  it("carries the created / updated / closed / due dates as ISO strings", async () => {
    queryRaw.mockImplementation(
      routeQueries([
        [/FROM rv_work_orders/, []],
        [/FROM activities/, []],
        [
          /FROM work_orders/,
          [
            woRow({ created_at: hoursAgo(48), updated_at: hoursAgo(2), due_at: "2026-10-30T16:00:00Z" }),
            woRow({ source_id: "x", created_at: null, updated_at: null, due_at: null }),
          ],
        ],
      ]) as never
    );

    const rows = await listWorkOrders();

    expect(rows![0]).toMatchObject({
      createdAt: hoursAgo(48).toISOString(),
      updatedAt: hoursAgo(2).toISOString(),
      closedAt: null,
      dueAt: "2026-10-30T16:00:00.000Z",
    });
    expect(rows![1]).toMatchObject({ createdAt: null, updatedAt: null, dueAt: null });
  });

  it("reads due_at without requiring the column, so it works before the sync adds it", async () => {
    queryRaw.mockImplementation(
      routeQueries([
        [/FROM rv_work_orders/, []],
        [/FROM activities/, []],
        [/FROM work_orders/, []],
      ]) as never
    );

    await listWorkOrders();

    const woSql = queryRaw.mock.calls.map(([q]) => sqlOf(q)).find((t) => /FROM work_orders/.test(t))!;
    expect(woSql).toMatch(/to_jsonb\(w\) ->> 'due_at'/);
    expect(woSql).not.toMatch(/[ ,]due_at,/);
  });

  it("returns null when the work_orders table is missing", async () => {
    queryRaw.mockImplementation(
      routeQueries([
        [/FROM rv_work_orders/, []],
        [/FROM activities/, []],
        [/FROM work_orders/, new Error("no table")],
      ]) as never
    );
    expect(await listWorkOrders()).toBeNull();
  });
});
