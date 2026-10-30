// @vitest-environment jsdom
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TransactionsTable } from "@/app/(app)/accounting/transactions/TransactionsTable";
import type { TxnRow } from "@/lib/plaid-db";

const rows: TxnRow[] = [
  {
    transactionId: "t1",
    postedDate: "2026-10-27",
    accountName: "American Express",
    merchantName: "The Home Depot",
    name: "HOMEDEPOT #1",
    amount: 100,
    category: "HOME_IMPROVEMENT",
    pending: false,
    reimbursable: null,
    categoryOverride: "",
    recordedQuickbooks: false,
    recordedRentvine: false,
    notes: "",
    propertyId: null,
    unitId: null,
  },
  {
    transactionId: "t2",
    postedDate: "2026-10-20",
    accountName: "The Home Depot",
    merchantName: "Lowe's",
    name: "LOWES #2",
    amount: 200,
    category: "HOME_IMPROVEMENT",
    pending: false,
    reimbursable: "yes",
    categoryOverride: "",
    recordedQuickbooks: true,
    recordedRentvine: false,
    notes: "",
    propertyId: null,
    unitId: null,
  },
];

let fetchMock: ReturnType<typeof vi.fn>;
beforeEach(() => {
  fetchMock = vi.fn(async () => ({ ok: true, json: async () => ({ ok: true }) }));
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

function setup() {
  const user = userEvent.setup();
  render(<TransactionsTable initialRows={rows} accounts={["American Express", "The Home Depot"]} />);
  return { user };
}

describe("TransactionsTable", () => {
  it("shows a summary across all rows", () => {
    setup();
    // total spend = 100 + 200
    expect(screen.getByText("$300")).toBeInTheDocument();
    // one row still unreviewed for reimbursable (tile label is a span; the
    // facet dropdown also has an "Unreviewed" <option>, so scope to the span)
    const unreviewed = screen.getByText("Unreviewed", { selector: "span" }).closest("div")!;
    expect(within(unreviewed).getByText("1")).toBeInTheDocument();
  });

  it("marks a transaction recorded in QuickBooks via PATCH", async () => {
    const { user } = setup();
    await user.click(screen.getByLabelText("quickbooks-t1"));

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("/api/plaid/transactions/t1");
    expect(init.method).toBe("PATCH");
    expect(JSON.parse(init.body)).toEqual({ recordedQuickbooks: true });
  });

  it("sets reimbursable from the dropdown", async () => {
    const { user } = setup();
    await user.selectOptions(screen.getByLabelText("reimbursable-t1"), "yes");

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("/api/plaid/transactions/t1");
    expect(JSON.parse(init.body)).toEqual({ reimbursable: "yes" });
  });

  it("commits a category override on blur", async () => {
    const { user } = setup();
    const input = screen.getByLabelText("category-t1");
    await user.type(input, "Supplies");
    await user.tab(); // blur

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ categoryOverride: "Supplies" });
  });

  it("rolls back the optimistic edit when the save fails", async () => {
    fetchMock.mockResolvedValueOnce({ ok: false, json: async () => ({ error: "nope" }) });
    const { user } = setup();
    const box = screen.getByLabelText("quickbooks-t1") as HTMLInputElement;
    expect(box.checked).toBe(false);

    await user.click(box);

    // the failure is surfaced and the checkbox reverts to its saved state
    expect(await screen.findByText(/couldn't be saved/i)).toBeInTheDocument();
    expect((screen.getByLabelText("quickbooks-t1") as HTMLInputElement).checked).toBe(false);
  });

  it("doesn't PATCH when a text field is left unchanged", async () => {
    const { user } = setup();
    const input = screen.getByLabelText("category-t1");
    await user.click(input);
    await user.tab();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("says how many transactions the admin filters are hiding, with a link for admins", () => {
    render(<TransactionsTable initialRows={rows} accounts={[]} hiddenCount={12} canManageFilters />);
    expect(screen.getByText(/12 transactions hidden by filters/i)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /manage filters/i }).getAttribute("href")).toBe("/admin/transaction-filters");
  });

  it("doesn't offer the filter link to non-admins", () => {
    render(<TransactionsTable initialRows={rows} accounts={[]} hiddenCount={1} />);
    expect(screen.getByText(/1 transaction hidden by filters/i)).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /manage filters/i })).toBeNull();
  });

  it("keeps the Reimbursable / QuickBooks / Rentvine headers on one line", () => {
    setup();
    for (const name of [/reimbursable\?/i, /in quickbooks/i, /in rentvine/i]) {
      expect(screen.getByRole("columnheader", { name }).className).toMatch(/\bwhitespace-nowrap\b/);
    }
  });

  describe("bulk reimbursable", () => {
    it("selects several transactions and sets them all reimbursable in one save", async () => {
      const { user } = setup();
      await user.click(screen.getByRole("button", { name: /^select$/i }));
      await user.click(screen.getByLabelText("select-t1"));
      await user.click(screen.getByLabelText("select-t2"));
      expect(screen.getByText("2 selected")).toBeInTheDocument();

      await user.click(screen.getByRole("button", { name: /set reimbursable: yes/i }));

      expect(fetchMock).toHaveBeenCalledTimes(1);
      const [url, init] = fetchMock.mock.calls[0];
      expect(url).toBe("/api/plaid/transactions");
      expect(init.method).toBe("PATCH");
      expect(JSON.parse(init.body)).toEqual({ ids: ["t1", "t2"], reimbursable: "yes" });
      expect((screen.getByLabelText("reimbursable-t1") as HTMLSelectElement).value).toBe("yes");
      expect(screen.queryByText(/selected/)).toBeNull(); // selection cleared after saving
    });

    it("selects everything currently shown (respecting the search)", async () => {
      const { user } = setup();
      await user.type(screen.getByPlaceholderText(/search merchant/i), "lowe");
      await user.click(screen.getByRole("button", { name: /^select$/i }));
      await user.click(screen.getByRole("button", { name: /select all 1 shown/i }));
      await user.click(screen.getByRole("button", { name: /set reimbursable: no/i }));

      expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ ids: ["t2"], reimbursable: "no" });
    });

    it("rolls every row back if the bulk save fails", async () => {
      fetchMock.mockResolvedValueOnce({ ok: false, json: async () => ({ error: "nope" }) });
      const { user } = setup();
      await user.click(screen.getByRole("button", { name: /^select$/i }));
      await user.click(screen.getByLabelText("select-t1"));
      await user.click(screen.getByRole("button", { name: /set reimbursable: no/i }));

      expect(await screen.findByText(/couldn't be saved/i)).toBeInTheDocument();
      expect((screen.getByLabelText("reimbursable-t1") as HTMLSelectElement).value).toBe("");
    });

    it("hides the checkboxes until Select is turned on", () => {
      setup();
      expect(screen.queryByLabelText("select-t1")).toBeNull();
    });
  });

  describe("category search box", () => {
    it("suggests the category list while typing", () => {
      render(<TransactionsTable initialRows={rows} accounts={[]} categories={["Payroll", "Supplies"]} />);
      const input = screen.getByLabelText("category-t1");
      const list = document.getElementById(input.getAttribute("list")!)!;
      expect([...list.querySelectorAll("option")].map((o) => o.getAttribute("value"))).toEqual(["Payroll", "Supplies"]);
    });

    it("shows the server's reason and reverts when a category is refused", async () => {
      fetchMock.mockResolvedValueOnce({ ok: false, json: async () => ({ error: "“Snacks” isn't an approved category." }) });
      const { user } = setup();
      await user.type(screen.getByLabelText("category-t1"), "Snacks");
      await user.tab();
      expect(await screen.findByText(/isn't an approved category/i)).toBeInTheDocument();
      expect((screen.getByLabelText("category-t1") as HTMLInputElement).value).toBe("");
    });

    it("shows the saved spelling the server chose", async () => {
      fetchMock.mockResolvedValueOnce({ ok: true, json: async () => ({ ok: true, patch: { categoryOverride: "Payroll" } }) });
      const { user } = setup();
      await user.type(screen.getByLabelText("category-t1"), "pay roll");
      await user.tab();
      await screen.findByDisplayValue("Payroll");
    });
  });

  it("centers the Reimbursable / QuickBooks / Rentvine columns under their headers", () => {
    setup();
    for (const name of [/reimbursable\?/i, /in quickbooks/i, /in rentvine/i]) {
      expect(screen.getByRole("columnheader", { name }).className).toMatch(/\btext-center\b/);
    }
    expect(screen.getByLabelText("quickbooks-t1").closest("td")!.className).toMatch(/\btext-center\b/);
    expect(screen.getByLabelText("reimbursable-t1").closest("td")!.className).toMatch(/\btext-center\b/);
  });

  it("saves the category when you press Enter", async () => {
    const { user } = setup();
    await user.type(screen.getByLabelText("category-t1"), "Supplies{Enter}");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ categoryOverride: "Supplies" });
  });

  it("saves notes when you press Enter", async () => {
    const { user } = setup();
    await user.type(screen.getByLabelText("notes-t1"), "owner to repay{Enter}");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ notes: "owner to repay" });
  });

  describe("property typeahead", () => {
    const properties = [
      { label: "66 Francis Court · Elmont", propertyId: "p1", unitId: null },
      { label: "8204 138th Street · Jamaica", propertyId: "p2", unitId: null },
      { label: "8204 138th Street · Jamaica — Unit 2", propertyId: "p2", unitId: "u2" },
    ];
    const renderWith = (r = rows) => {
      const user = userEvent.setup();
      render(<TransactionsTable initialRows={r} accounts={[]} properties={properties} />);
      return { user };
    };

    it("suggests existing properties and units while typing", () => {
      renderWith();
      const input = screen.getByLabelText("property-t1");
      const list = document.getElementById(input.getAttribute("list")!)!;
      expect([...list.querySelectorAll("option")].map((o) => o.getAttribute("value"))).toEqual([
        "66 Francis Court · Elmont",
        "8204 138th Street · Jamaica",
        "8204 138th Street · Jamaica — Unit 2",
      ]);
    });

    it("shows the linked property, or property and unit", () => {
      renderWith([{ ...rows[0], propertyId: "p2", unitId: "u2" }, { ...rows[1], propertyId: "p1" }]);
      expect((screen.getByLabelText("property-t1") as HTMLInputElement).value).toBe("8204 138th Street · Jamaica — Unit 2");
      expect((screen.getByLabelText("property-t2") as HTMLInputElement).value).toBe("66 Francis Court · Elmont");
    });

    it("saves the chosen property (no unit)", async () => {
      const { user } = renderWith();
      await user.type(screen.getByLabelText("property-t1"), "66 francis court · elmont{Enter}");
      expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ propertyId: "p1", unitId: null });
    });

    it("saves a unit together with its property", async () => {
      const { user } = renderWith();
      await user.type(screen.getByLabelText("property-t1"), "8204 138th Street · Jamaica — Unit 2{Enter}");
      expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ propertyId: "p2", unitId: "u2" });
    });

    it("refuses anything that isn't an existing property, without saving", async () => {
      const { user } = renderWith();
      await user.type(screen.getByLabelText("property-t1"), "123 Nowhere Rd{Enter}");
      expect(fetchMock).not.toHaveBeenCalled();
      expect(screen.getByText(/pick a property from the list/i)).toBeInTheDocument();
      expect((screen.getByLabelText("property-t1") as HTMLInputElement).value).toBe("");
    });

    it("clears the property and unit when the box is emptied", async () => {
      const { user } = renderWith([{ ...rows[0], propertyId: "p2", unitId: "u2" }, rows[1]]);
      await user.clear(screen.getByLabelText("property-t1"));
      await user.keyboard("{Enter}");
      expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ propertyId: null, unitId: null });
    });
  });
});
