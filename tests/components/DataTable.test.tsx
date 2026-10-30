// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { DataTable, type Column, type Facet } from "@/components/DataTable";

type Row = { id: string; address: string; city: string; rent: number; status: string; start: string | null };

const rows: Row[] = [
  { id: "1", address: "66 Francis Court", city: "Elmont", rent: 2500, status: "active", start: "2026-04-01" },
  { id: "2", address: "25 Thorney Lane", city: "Valley Stream", rent: 3100, status: "closed", start: "2024-10-01" },
  { id: "3", address: "9 Oak Ave", city: "Elmont", rent: 1800, status: "active", start: null },
  { id: "4", address: "120 Pine St", city: "Hempstead", rent: 2500, status: "active", start: "2025-06-15" },
];

const columns: Column<Row>[] = [
  { key: "address", header: "Address", sortable: true, sortValue: (r) => r.address, render: (r) => r.address },
  {
    key: "city",
    header: "City",
    sortable: true,
    sortValue: (r) => r.city,
    render: (r) => r.city,
    filter: { type: "select", value: (r) => r.city },
  },
  {
    key: "rent",
    header: "Rent",
    sortable: true,
    sortValue: (r) => r.rent,
    render: (r) => `$${r.rent}`,
    filter: { type: "number", value: (r) => r.rent },
  },
  { key: "start", header: "Start", render: (r) => r.start ?? "—", filter: { type: "date", value: (r) => r.start } },
];

const facets: Facet<Row>[] = [
  {
    key: "status",
    label: "Status",
    options: [
      { value: "active", label: "Active" },
      { value: "closed", label: "Closed" },
    ],
    match: (r, v) => r.status === v,
  },
];

function setup(props: Partial<Parameters<typeof DataTable<Row>>[0]> = {}) {
  const user = userEvent.setup();
  const utils = render(
    <DataTable<Row>
      rows={rows}
      columns={columns}
      rowKey={(r) => r.id}
      search={(r) => `${r.address} ${r.city}`}
      facets={facets}
      {...props}
    />
  );
  const addresses = () =>
    [...utils.container.querySelectorAll("tbody tr")].map((tr) => tr.querySelector("td")!.textContent);
  return { user, addresses };
}

describe("DataTable", () => {
  it("renders every row and the count", () => {
    const { addresses } = setup();
    expect(addresses()).toEqual(["66 Francis Court", "25 Thorney Lane", "9 Oak Ave", "120 Pine St"]);
    expect(screen.getByText("4 of 4")).toBeInTheDocument();
  });

  it("searches case-insensitively across the search text", async () => {
    const { user, addresses } = setup();
    await user.type(screen.getByPlaceholderText("Search…"), "ELMONT");
    expect(addresses()).toEqual(["66 Francis Court", "9 Oak Ave"]);
    expect(screen.getByText("2 of 4")).toBeInTheDocument();
    expect(screen.getByText("1 filter active")).toBeInTheDocument();
  });

  it("filters by a facet", async () => {
    const { user, addresses } = setup();
    await user.selectOptions(screen.getByDisplayValue("Status: All"), "closed");
    expect(addresses()).toEqual(["25 Thorney Lane"]);
  });

  it("clears every filter at once", async () => {
    const { user, addresses } = setup();
    await user.type(screen.getByPlaceholderText("Search…"), "elmont");
    await user.selectOptions(screen.getByDisplayValue("Status: All"), "active");
    expect(screen.getByText("2 filters active")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Clear" }));

    expect(addresses()).toHaveLength(4);
    expect(screen.queryByText(/filters? active/)).toBeNull();
  });

  it("cycles a column sort ascending → descending → off", async () => {
    const { user, addresses } = setup();
    const header = screen.getByText("Address");

    await user.click(header);
    expect(addresses()).toEqual(["120 Pine St", "25 Thorney Lane", "66 Francis Court", "9 Oak Ave"]);
    await user.click(header);
    expect(addresses()).toEqual(["9 Oak Ave", "66 Francis Court", "25 Thorney Lane", "120 Pine St"]);
    await user.click(header);
    expect(addresses()).toEqual(["66 Francis Court", "25 Thorney Lane", "9 Oak Ave", "120 Pine St"]);
  });

  it("adds a secondary sort with shift-click", async () => {
    const { user, addresses } = setup();

    await user.click(screen.getByText("Rent"));
    await user.keyboard("{Shift>}");
    await user.click(screen.getByText("Address"));
    await user.keyboard("{/Shift}");

    // rent asc; the two $2500 rows ordered by address
    expect(addresses()).toEqual(["9 Oak Ave", "120 Pine St", "66 Francis Court", "25 Thorney Lane"]);
  });

  it("starts from an initial sort and initial facet", () => {
    const { addresses } = setup({ initialSort: { key: "rent", dir: "desc" }, initialFacets: { status: "active" } });
    expect(addresses()).toEqual(["66 Francis Court", "120 Pine St", "9 Oak Ave"]);
  });

  it.each([
    ["select", { city: { sels: ["Elmont", "Hempstead"] } }, ["66 Francis Court", "9 Oak Ave", "120 Pine St"]],
    ["number min/max", { rent: { min: "2000", max: "3000" } }, ["66 Francis Court", "120 Pine St"]],
    ["date range (undated rows excluded)", { start: { from: "2025-01-01", to: "2026-12-31" } }, ["66 Francis Court", "120 Pine St"]],
  ])("applies a %s column filter", (_label, initialColumnFilters, expected) => {
    const { addresses } = setup({ initialColumnFilters });
    expect(addresses()).toEqual(expected);
  });

  it("shows an empty state when nothing matches", async () => {
    const { user } = setup();
    await user.type(screen.getByPlaceholderText("Search…"), "no such place");
    expect(screen.getByText("0 of 4")).toBeInTheDocument();
  });

  // One scrollbar: the header stays pinned against the page's own scroll, not
  // inside a height-capped box with a second scrollbar.
  it("pins the header without a scroll box of its own", () => {
    render(<DataTable rows={rows} columns={columns} rowKey={(r) => r.id} />);

    const table = screen.getByRole("table");
    const box = table.parentElement!;
    expect(box.className).not.toMatch(/max-h-/);
    expect(box.className).not.toMatch(/(^|\s)overflow-auto(\s|$)/);
    expect(box.className).not.toMatch(/(^|\s)overflow-hidden(\s|$)/); // would also trap the sticky header
    for (const th of table.querySelectorAll("th")) expect(th.className).toMatch(/\bsticky\b/);
    // Pins below any sticky page header above it (pages set --sticky-offset).
    for (const th of table.querySelectorAll("th")) expect(th.style.top).toBe("var(--sticky-offset, 0px)");
  });

  it("keeps a header on one line when the column asks for it", () => {
    const cols: Column<Row>[] = [
      { key: "address", header: "Address", render: (r) => r.address },
      { key: "city", header: "City name", nowrap: true, render: (r) => r.city },
    ];
    render(<DataTable rows={rows} columns={cols} rowKey={(r) => r.id} />);
    expect(screen.getByRole("columnheader", { name: /city name/i }).className).toMatch(/\bwhitespace-nowrap\b/);
    expect(screen.getByRole("columnheader", { name: /address/i }).className).not.toMatch(/whitespace-nowrap/);
  });

  it("reports the rows currently shown after filtering", async () => {
    const seen: string[][] = [];
    render(
      <DataTable
        rows={rows}
        columns={columns}
        rowKey={(r) => r.id}
        search={(r) => r.address}
        onFilteredChange={(shown) => seen.push(shown.map((r) => r.id))}
      />
    );
    await userEvent.setup().type(screen.getByRole("textbox"), "oak");
    expect(seen.at(-1)).toEqual(["3"]);
  });
});
