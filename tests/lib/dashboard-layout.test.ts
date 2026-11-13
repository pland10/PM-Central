import { describe, expect, it } from "vitest";
import {
  isDefaultLayout,
  moveWithin,
  reconcileLayout,
  toggleCollapsed,
  type LayoutDefaults,
} from "@/lib/dashboard-layout";

// Three levels: root → sections, section → groups (tiles / charts), group → widgets.
const DEFAULTS: LayoutDefaults = {
  root: ["collections", "workorders"],
  collections: ["collections.tiles", "collections.charts"],
  "collections.tiles": ["col.collected", "col.pending"],
  "collections.charts": ["col.rent", "col.returns"],
  workorders: ["workorders.tiles", "workorders.charts"],
  "workorders.tiles": ["wo.open", "wo.closed"],
  "workorders.charts": ["wo.openedClosed"],
};

describe("reconcileLayout", () => {
  it("falls back to the defaults for missing or malformed saved data", () => {
    for (const saved of [null, undefined, "x", 3, { order: "nope" }, { order: { root: [1, 2] } }]) {
      const l = reconcileLayout(saved, DEFAULTS);
      expect(l.order).toEqual(DEFAULTS);
      expect(l.collapsed).toEqual([]);
    }
  });

  it("keeps the saved order, drops ids that no longer exist, appends new ones", () => {
    const l = reconcileLayout(
      { order: { root: ["workorders", "gone", "collections"], "collections.tiles": ["col.pending"] }, collapsed: [] },
      DEFAULTS
    );
    expect(l.order.root).toEqual(["workorders", "collections"]);
    expect(l.order["collections.tiles"]).toEqual(["col.pending", "col.collected"]);
    expect(l.order["collections.charts"]).toEqual(["col.rent", "col.returns"]);
  });

  it("never lets a saved layout move a widget into another section", () => {
    const l = reconcileLayout(
      { order: { "collections.tiles": ["wo.open", "col.collected", "col.pending"] }, collapsed: [] },
      DEFAULTS
    );
    expect(l.order["collections.tiles"]).toEqual(["col.collected", "col.pending"]);
    expect(l.order["workorders.tiles"]).toEqual(["wo.open", "wo.closed"]);
  });

  it("keeps only known section ids as collapsed", () => {
    const l = reconcileLayout({ order: {}, collapsed: ["workorders", "nope", "col.rent", 7] }, DEFAULTS);
    expect(l.collapsed).toEqual(["workorders"]);
  });
});

describe("moveWithin", () => {
  const base = reconcileLayout(null, DEFAULTS);

  it("reorders sections", () => {
    expect(moveWithin(base, "root", "workorders", "collections").order.root).toEqual(["workorders", "collections"]);
  });

  it("reorders the groups inside a section (charts above tiles)", () => {
    const l = moveWithin(base, "collections", "collections.charts", "collections.tiles");
    expect(l.order.collections).toEqual(["collections.charts", "collections.tiles"]);
  });

  it("reorders widgets within their group", () => {
    const l = moveWithin(base, "collections.charts", "col.returns", "col.rent");
    expect(l.order["collections.charts"]).toEqual(["col.returns", "col.rent"]);
  });

  it("refuses to move a widget across groups or sections", () => {
    expect(moveWithin(base, "collections.tiles", "wo.open", "col.collected")).toBe(base);
    expect(moveWithin(base, "collections.tiles", "col.rent", "col.collected")).toBe(base);
  });

  it("is a no-op when dropped on itself or nothing", () => {
    expect(moveWithin(base, "root", "collections", "collections")).toBe(base);
    expect(moveWithin(base, "root", "collections", null)).toBe(base);
  });

  it("does not mutate the input", () => {
    const snapshot = JSON.stringify(base);
    moveWithin(base, "root", "workorders", "collections");
    expect(JSON.stringify(base)).toBe(snapshot);
  });
});

describe("toggleCollapsed / isDefaultLayout", () => {
  it("toggles a section's collapsed state", () => {
    const base = reconcileLayout(null, DEFAULTS);
    const once = toggleCollapsed(base, "workorders");
    expect(once.collapsed).toEqual(["workorders"]);
    expect(toggleCollapsed(once, "workorders").collapsed).toEqual([]);
  });

  it("reports whether anything differs from the defaults", () => {
    const base = reconcileLayout(null, DEFAULTS);
    expect(isDefaultLayout(base, DEFAULTS)).toBe(true);
    expect(isDefaultLayout(moveWithin(base, "collections.charts", "col.returns", "col.rent"), DEFAULTS)).toBe(false);
    expect(isDefaultLayout(toggleCollapsed(base, "collections"), DEFAULTS)).toBe(false);
  });
});
