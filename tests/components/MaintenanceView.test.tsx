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

  it("lists work orders requiring attention, most urgent first, with the reason", () => {
    render(<MaintenanceView rows={rows} now={NOW} />);

    const table = screen.getByRole("table", { name: /requiring attention/i });
    const bodyRows = within(table).getAllByRole("row").slice(1);
    expect(bodyRows.map((r) => within(r).getAllByRole("cell")[0].textContent)).toEqual(["102", "101"]);
    expect(within(bodyRows[0]).getByText("High priority")).toBeTruthy();
    expect(within(bodyRows[1]).getByText("Stalled 6 days")).toBeTruthy();
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
});
