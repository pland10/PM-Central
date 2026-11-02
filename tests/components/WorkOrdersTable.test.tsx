// @vitest-environment jsdom
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
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

  it("shows how many notes a work order has and the latest one", () => {
    render(
      <WorkOrdersTable
        rows={[wo({})]}
        notes={{ x: { count: 2, latest: "Owner approved", latestAt: "2026-11-02T14:00:00.000Z", latestBy: "Paul Landman" } }}
      />
    );
    const row = rowOf("100480");
    expect(within(row).getByText("Owner approved")).toBeTruthy();
    expect(within(row).getByRole("button", { name: /2 notes/i })).toBeTruthy();
  });

  it("opens the notes panel from the Notes column", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ notes: [], staff: [], assigneeEmail: "" }) })));
    render(<WorkOrdersTable rows={[wo({})]} notes={{}} />);
    await userEvent.setup().click(within(rowOf("100480")).getByRole("button", { name: /add note/i }));
    expect(screen.getByRole("dialog", { name: /notes for wo #100480/i })).toBeTruthy();
    vi.unstubAllGlobals();
  });
});
