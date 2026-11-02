// @vitest-environment jsdom
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

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
    expect(within(within(attention()).getByRole("table")).getByText("Completed in Rentvine · open in LeadSimple")).toBeTruthy();
  });

  it("can filter the attention list to work orders On Hold in Rentvine", async () => {
    const user = userEvent.setup();
    render(<MaintenanceView rows={[...rows, wo({ number: "106", issue: "Fridge shelves", rvStatus: "On Hold" })]} now={NOW} />);

    await user.selectOptions(within(attention()).getByRole("combobox", { name: /reason/i }), "rvOnHold");
    expect(firstCells()).toEqual(["106"]);
    expect(within(within(attention()).getByRole("table")).getByText("On Hold in Rentvine · open in LeadSimple")).toBeTruthy();
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

  it("can filter the attention list to WOs waiting on estimates", async () => {
    const user = userEvent.setup();
    render(<MaintenanceView rows={[...rows, wo({ number: "106", issue: "Roof", stage: "Estimate Requested", updatedAt: daysAgo(5) })]} now={NOW} />);

    await user.selectOptions(within(attention()).getByRole("combobox", { name: /reason/i }), "estimates");
    expect(firstCells()).toEqual(["106"]);
    expect(within(within(attention()).getByRole("table")).getByText("Waiting on estimates 5 days")).toBeTruthy();
  });

  it("shows the LeadSimple stage in the attention table", () => {
    render(<MaintenanceView rows={rows} now={NOW} />);
    const table = within(attention()).getByRole("table");
    expect(within(table).getByRole("columnheader", { name: /stage/i })).toBeTruthy();
    const row = within(table).getByText("101").closest("tr")!;
    expect(within(row).getByText("Troubleshooting")).toBeTruthy();
  });

  it("shows notes on both tables and opens the notes panel", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ notes: [], staff: [], assigneeEmail: "" }) })));
    const user = userEvent.setup();
    render(
      <MaintenanceView
        rows={rows}
        now={NOW}
        notes={{ "101": { count: 1, latest: "Vendor coming Tue", latestAt: "2026-10-27T12:00:00.000Z", latestBy: "Paul" } }}
      />
    );
    const attnRow = within(within(attention()).getByRole("table")).getByText("101").closest("tr")!;
    expect(within(attnRow).getByText("Vendor coming Tue")).toBeTruthy();
    const list = screen.getByRole("region", { name: /all work orders/i });
    const listRow = within(list).getByText("Fridge noise").closest("tr")!;
    await user.click(within(listRow).getByRole("button", { name: /add note/i }));
    expect(screen.getByRole("dialog", { name: /notes for wo #103/i })).toBeTruthy();
    vi.unstubAllGlobals();
  });

  describe("tech assignment", () => {
    const staff = [
      { name: "Ari Cohen", email: "ari@pmi.com" },
      { name: "Paul Landman", email: "paul@pmi.com" },
    ];
    const list = () => screen.getByRole("region", { name: /all work orders/i });
    const listRows = () =>
      within(within(list()).getByRole("table")).getAllByRole("row").slice(1).map((r) => within(r).getAllByRole("cell")[0].textContent);

    it("shows each work order's tech in a dropdown and saves a change", async () => {
      const fetchMock = vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ ok: true, tech: staff[0] }) }));
      vi.stubGlobal("fetch", fetchMock);
      const user = userEvent.setup();
      render(<MaintenanceView rows={rows} now={NOW} staff={staff} techs={{ "102": staff[1] }} />);

      const select103 = within(list()).getByLabelText("tech-103") as HTMLSelectElement;
      expect(select103.value).toBe("");
      expect((within(list()).getByLabelText("tech-102") as HTMLSelectElement).value).toBe("paul@pmi.com");

      await user.selectOptions(select103, "ari@pmi.com");
      const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
      expect(url).toBe("/api/work-orders/tech");
      expect(JSON.parse(String(init.body))).toEqual({ woId: "103", techEmail: "ari@pmi.com" });
      expect((within(list()).getByLabelText("tech-103") as HTMLSelectElement).value).toBe("ari@pmi.com");
      vi.unstubAllGlobals();
    });

    it("can filter the list by tech, including unassigned", async () => {
      const user = userEvent.setup();
      render(<MaintenanceView rows={rows} now={NOW} staff={staff} techs={{ "102": staff[1] }} />);
      const header = within(list()).getByRole("columnheader", { name: /^tech/i });
      await user.click(within(header).getByRole("button", { name: /filter/i }));
      await user.click(screen.getByRole("button", { name: /paul landman/i }));
      expect(listRows()).toEqual(["102"]);
    });

    it("also shows the tech on the attention table", () => {
      render(<MaintenanceView rows={rows} now={NOW} staff={staff} techs={{ "101": staff[0] }} />);
      const attn = within(attention()).getByRole("table");
      expect((within(attn).getByLabelText("tech-101") as HTMLSelectElement).value).toBe("ari@pmi.com");
    });
  });
});
