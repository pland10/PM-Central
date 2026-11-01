// @vitest-environment jsdom
import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { WorkOrdersTable, type WorkOrderRow } from "@/app/(app)/work-orders/WorkOrdersTable";

function wo(over: Partial<WorkOrderRow>): WorkOrderRow {
  return {
    id: over.number ?? "x",
    number: "100480",
    issue: "Garage door wire broke",
    stage: "Invoice Received",
    terminal: false,
    property: "109 Chase Road",
    vendor: "",
    assignee: "",
    link: "",
    priority: "Medium",
    propertyId: null,
    lastUpdate: "",
    lastUpdateAt: null,
    createdAt: "2026-10-14T15:00:00.000Z",
    updatedAt: "2026-10-28T15:00:00.000Z",
    closedAt: null,
    dueAt: null,
    rvStatus: "",
    ...over,
  };
}

const rowOf = (num: string) => screen.getByText(num).closest("tr")!;
const headers = () => screen.getAllByRole("columnheader").map((h) => h.textContent?.replace(/[↑↓↕]/g, "").trim());

describe("WorkOrdersTable", () => {
  it("has a Submitted column just left of Latest update, showing the created date", () => {
    render(<WorkOrdersTable rows={[wo({})]} />);
    const h = headers();
    expect(h.indexOf("Submitted")).toBe(h.indexOf("Latest update") - 1);
    expect(within(rowOf("100480")).getByText("Oct 14, 2026")).toBeTruthy();
  });

  it("shows the Rentvine work-order note when there is one", () => {
    render(<WorkOrdersTable rows={[wo({ lastUpdate: "Vendor scheduled for Tue", lastUpdateAt: "2026-10-29T15:00:00.000Z" })]} />);
    expect(within(rowOf("100480")).getByText("Vendor scheduled for Tue")).toBeTruthy();
  });

  it("falls back to LeadSimple's last change when there's no Rentvine note", () => {
    render(<WorkOrdersTable rows={[wo({})]} />);
    const row = rowOf("100480");
    expect(within(row).getByText("Updated in LeadSimple")).toBeTruthy();
    expect(within(row).getByText("Oct 28, 2026")).toBeTruthy();
  });
});
