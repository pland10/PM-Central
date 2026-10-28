// @vitest-environment jsdom
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import { MaintenanceView } from "@/app/(app)/maintenance/MaintenanceView";
import type { WorkOrderRow } from "@/lib/work-orders";

const NOW = new Date("2026-10-27T15:00:00Z").getTime();
const daysAgo = (d: number) => new Date(NOW - d * 86_400_000).toISOString();

function wo(over: Partial<WorkOrderRow>): WorkOrderRow {
  return {
    id: over.number ?? "x",
    number: "100",
    issue: "Leaking sink",
    stage: "Troubleshooting",
    terminal: false,
    property: "1 Main St",
    vendor: "",
    assignee: "",
    link: "",
    priority: "",
    propertyId: null,
    lastUpdate: "",
    lastUpdateAt: null,
    createdAt: daysAgo(10),
    updatedAt: daysAgo(1),
    closedAt: null,
    dueAt: null,
    rvStatus: "",
    ...over,
  };
}

const rows = [
  wo({ number: "101", issue: "Gutter cleaning", updatedAt: daysAgo(6) }), // stalled
  wo({ number: "102", issue: "No heat", priority: "High" }), // high
  wo({ number: "103", issue: "Fridge noise" }), // fine
  wo({ number: "104", issue: "Roof leak", terminal: true, stage: "Completed", closedAt: daysAgo(2) }),
];

const tile = (name: RegExp) => screen.getByRole("group", { name });

describe("MaintenanceView", () => {
  it("shows live KPI counts, and — for Overdue until due dates exist", () => {
    render(<MaintenanceView rows={rows} now={NOW} />);

    expect(within(tile(/^open/i)).getByText("3")).toBeTruthy();
    expect(within(tile(/stalled/i)).getByText("1")).toBeTruthy();
    expect(within(tile(/overdue/i)).getByText("—")).toBeTruthy();
    expect(within(tile(/completed this week/i)).getByText("1")).toBeTruthy();
  });

  const attention = () => screen.getByRole("region", { name: /requiring attention/i });
  const firstCells = () =>
    within(within(attention()).getByRole("table"))
      .getAllByRole("row")
      .slice(1)
      .map((r) => within(r).getAllByRole("cell")[0].textContent);

  it("lists work orders requiring attention, most urgent first, with the reason", () => {
    render(<MaintenanceView rows={rows} now={NOW} />);

    expect(firstCells()).toEqual(["102", "101"]);
    const table = within(attention()).getByRole("table");
    expect(within(table).getByText("High priority")).toBeTruthy();
    expect(within(table).getByText("Stalled 6 days")).toBeTruthy();
  });

  it("shows every flagged work order, not just the top few", () => {
    const many = Array.from({ length: 12 }, (_, i) => wo({ number: String(200 + i), updatedAt: daysAgo(5 + i) }));
    render(<MaintenanceView rows={many} now={NOW} />);

    expect(firstCells()).toHaveLength(12);
    expect(firstCells()[0]).toBe("211"); // quiet longest first
  });

  it("filters the attention list by reason and sorts by column", async () => {
    const user = userEvent.setup();
    render(<MaintenanceView rows={rows} now={NOW} />);

    await user.selectOptions(within(attention()).getByRole("combobox", { name: /reason/i }), "stalled");
    expect(firstCells()).toEqual(["101"]);

    await user.selectOptions(within(attention()).getByRole("combobox", { name: /reason/i }), "");
    await user.click(within(attention()).getByText("WO #"));
    expect(firstCells()).toEqual(["101", "102"]);
  });

  it("can filter the attention list to work orders already closed in Rentvine", async () => {
    const user = userEvent.setup();
    render(<MaintenanceView rows={[...rows, wo({ number: "105", issue: "Paint", rvStatus: "Completed" })]} now={NOW} />);

    await user.selectOptions(within(attention()).getByRole("combobox", { name: /reason/i }), "rvClosed");
    expect(firstCells()).toEqual(["105"]);
    expect(within(within(attention()).getByRole("table")).getByText("Completed in Rentvine")).toBeTruthy();
  });

  it("defaults the full list to open work orders and can show completed ones", async () => {
    const user = userEvent.setup();
    render(<MaintenanceView rows={rows} now={NOW} />);

    const list = screen.getByRole("region", { name: /all work orders/i });
    expect(within(list).queryByText("Roof leak")).toBeNull();
    expect(within(list).getByText("Fridge noise")).toBeTruthy();

    await user.selectOptions(within(list).getByRole("combobox", { name: /status/i }), "completed");
    expect(within(list).getByText("Roof leak")).toBeTruthy();
    expect(within(list).queryByText("Fridge noise")).toBeNull();
  });

  it("pins the title and KPI tiles at the top on wide screens", () => {
    render(<MaintenanceView rows={rows} now={NOW} />);

    const summary = screen.getByRole("region", { name: /maintenance summary/i });
    expect(summary.className).toMatch(/\blg:sticky\b/);
    expect(within(summary).getByRole("heading", { name: "Maintenance" })).toBeTruthy();
    expect(within(summary).getByRole("group", { name: /^open/i })).toBeTruthy();
  });

  it("shows the latest 6 activities and expands to everything from the last 7 days", async () => {
    const user = userEvent.setup();
    const recentRows = [
      ...Array.from({ length: 9 }, (_, i) => wo({ number: String(300 + i), updatedAt: daysAgo(i * 0.5) })),
      wo({ number: "399", updatedAt: daysAgo(20) }), // outside the 7-day window
    ];
    render(<MaintenanceView rows={recentRows} now={NOW} />);

    const recent = screen.getByRole("region", { name: /recent activity/i });
    expect(within(recent).getAllByRole("listitem")).toHaveLength(6);

    await user.click(within(recent).getByRole("button", { name: /show all 9/i }));
    expect(within(recent).getAllByRole("listitem")).toHaveLength(9);

    await user.click(within(recent).getByRole("button", { name: /show less/i }));
    expect(within(recent).getAllByRole("listitem")).toHaveLength(6);
  });
});
