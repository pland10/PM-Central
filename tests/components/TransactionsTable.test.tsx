// @vitest-environment jsdom
import { render, screen, waitFor, within } from "@testing-library/react";
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
    archived: false,
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
    archived: false,
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
    expect(screen.getByText("$300.00")).toBeInTheDocument();
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
    for (const name of [/reimbursable\?/i, /in quickbooks/i, /^in rentvine/i]) {
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
    for (const name of [/reimbursable\?/i, /in quickbooks/i, /^in rentvine/i]) {
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

  describe("notes thread", () => {
    const summaries = {
      t1: { count: 2, latest: "owner to repay", latestAt: "2026-11-13T12:00:00.000Z", latestBy: "Ann Admin" },
    };

    it("shows each charge's latest note and how many there are, or Add note", () => {
      render(<TransactionsTable initialRows={rows} accounts={[]} noteSummaries={summaries} />);
      expect(screen.getByText("owner to repay")).toBeInTheDocument();
      expect(screen.getByLabelText("notes-t1")).toHaveTextContent("2 notes");
      expect(screen.getByLabelText("notes-t2")).toHaveTextContent("Add note");
    });

    it("opens the thread for that charge (with email), instead of a one-line box", async () => {
      fetchMock.mockResolvedValue(
        new Response(JSON.stringify({ notes: [], staff: [{ name: "Bo Bookkeeper", email: "bo@pmi.com" }], me: "a@pmi.com", canModerate: true }), { status: 200 })
      );
      const user = userEvent.setup();
      render(<TransactionsTable initialRows={rows} accounts={[]} noteSummaries={summaries} />);
      await user.click(screen.getByLabelText("notes-t1"));
      const dialog = await screen.findByRole("dialog", { name: /notes for \$100\.00 · the home depot/i });
      expect(fetchMock.mock.calls.some((c) => String(c[0]) === "/api/accounting/transaction-notes?txn=t1")).toBe(true);
      expect(within(dialog).getByRole("button", { name: /add note & email/i })).toBeInTheDocument();
    });

    it("finds a charge by the text of its latest note", async () => {
      const user = userEvent.setup();
      render(<TransactionsTable initialRows={rows} accounts={[]} noteSummaries={summaries} />);
      await user.type(screen.getByPlaceholderText(/search merchant/i), "owner to repay");
      expect(screen.queryByLabelText("notes-t2")).toBeNull();
      expect(screen.getByLabelText("notes-t1")).toBeInTheDocument();
    });
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

  it("is a dense, wide table so no column gets cut off", () => {
    const { container } = render(<TransactionsTable initialRows={rows} accounts={[]} />);
    const box = container.querySelector("table")!.parentElement!;
    expect(box.className).toMatch(/\bw-max\b/);
    expect(screen.getAllByRole("columnheader")[0].className).toMatch(/\bpx-2\b/);
  });

  it("no longer shows the Plaid category column", () => {
    setup();
    expect(screen.queryByRole("columnheader", { name: /category \(plaid\)/i })).toBeNull();
  });

  describe("pending transactions are editable", () => {
    const pendingRow: TxnRow = { ...rows[0], transactionId: "p1", pending: true };

    it("lets you edit a pending row (edits carry over when it posts) and still marks it pending", () => {
      render(<TransactionsTable initialRows={[pendingRow]} accounts={[]} />);
      for (const label of ["reimbursable-p1", "quickbooks-p1", "rentvine-p1", "category-p1", "notes-p1", "property-p1"]) {
        expect(screen.getByLabelText(label)).not.toBeDisabled();
      }
      expect(screen.getByText("(pending)")).toBeInTheDocument();
    });

    it("can be picked in bulk select", async () => {
      const user = userEvent.setup();
      render(<TransactionsTable initialRows={[rows[0], pendingRow]} accounts={[]} />);
      await user.click(screen.getByRole("button", { name: /^select$/i }));
      expect(screen.getByLabelText("select-p1")).not.toBeDisabled();
    });
  });

  describe("needs review", () => {
    const dropped: TxnRow = {
      ...rows[0],
      transactionId: "d1",
      pending: true,
      postedDate: "2026-10-25",
      amount: 98,
      reimbursable: "yes",
      reviewReason: "pending_dropped",
      reviewDetail: "Pending charge disappeared with no posted replacement",
    };
    const changed: TxnRow = {
      ...rows[1],
      transactionId: "a1",
      amount: 52,
      reviewReason: "amount_changed",
      reviewDetail: "Pending was $45.00",
    };
    const droppedNotes = { d1: { count: 1, latest: "water heater parts", latestAt: "2026-10-25T12:00:00.000Z", latestBy: "Ann" } };
    const box = () => screen.getByRole("region", { name: /needs review/i });
    const reviewCalls = () =>
      fetchMock.mock.calls.filter((c) => String(c[0]).endsWith("/review")).map((c) => [String(c[0]), JSON.parse(c[1].body)]);

    it("keeps a dropped pending charge out of the table and in the review box", () => {
      render(<TransactionsTable initialRows={[rows[0], dropped]} accounts={[]} noteSummaries={droppedNotes} />);
      expect(screen.queryByLabelText("notes-d1")).toBeNull();
      expect(within(box()).getByText("water heater parts")).toBeInTheDocument();
      expect(within(box()).getByText(/disappeared with no posted replacement/i)).toBeInTheDocument();
    });

    it("moves its edits (and notes) onto the posted charge you pick", async () => {
      const user = userEvent.setup();
      render(<TransactionsTable initialRows={[rows[0], dropped]} accounts={[]} noteSummaries={droppedNotes} />);
      await user.selectOptions(within(box()).getByLabelText("move-target-d1"), "t1");
      await user.click(within(box()).getByRole("button", { name: /move edits/i }));
      expect(reviewCalls()).toEqual([["/api/plaid/transactions/d1/review", { action: "move", targetId: "t1" }]]);
      expect(screen.queryByRole("region", { name: /needs review/i })).toBeNull();
      expect(screen.getByLabelText("notes-t1")).toHaveTextContent("1 note");
      expect(screen.getByText("water heater parts")).toBeInTheDocument();
    });

    it("dismisses a declined/reversed one", async () => {
      const user = userEvent.setup();
      render(<TransactionsTable initialRows={[rows[0], dropped]} accounts={[]} />);
      await user.click(within(box()).getByRole("button", { name: /dismiss/i }));
      expect(reviewCalls()).toEqual([["/api/plaid/transactions/d1/review", { action: "dismiss" }]]);
      expect(screen.queryByRole("region", { name: /needs review/i })).toBeNull();
    });

    it("flags a carried-over charge whose amount changed, until someone says it looks right", async () => {
      const user = userEvent.setup();
      render(<TransactionsTable initialRows={[rows[0], changed]} accounts={[]} />);
      expect(screen.getByLabelText("notes-a1")).toBeInTheDocument(); // still in the table
      expect(within(box()).getByText(/pending was \$45\.00/i)).toBeInTheDocument();
      await user.click(within(box()).getByRole("button", { name: /looks right/i }));
      expect(reviewCalls()).toEqual([["/api/plaid/transactions/a1/review", { action: "ok" }]]);
      expect(screen.queryByRole("region", { name: /needs review/i })).toBeNull();
    });
  });

  describe("archive", () => {
    const both: TxnRow = { ...rows[0], transactionId: "t3", recordedQuickbooks: true, recordedRentvine: true };
    // QuickBooks only + marked not reimbursable — eligible under the new rule.
    const qbOnlyNR: TxnRow = { ...rows[0], transactionId: "t5", recordedQuickbooks: true, recordedRentvine: false, reimbursable: "no" };

    it("offers Archive on a both-recorded row and a QuickBooks-only not-reimbursable row, not otherwise", () => {
      // rows[1] (t2) is QuickBooks-only but reimbursable "yes" → not eligible yet.
      render(<TransactionsTable initialRows={[rows[0], rows[1], qbOnlyNR, both]} accounts={["American Express"]} />);
      expect(screen.getByLabelText("archive-t3")).toBeInTheDocument(); // in both
      expect(screen.getByLabelText("archive-t5")).toBeInTheDocument(); // QuickBooks only + not reimbursable
      expect(screen.queryByLabelText("archive-t2")).toBeNull(); // QuickBooks only but reimbursable → not yet
      expect(screen.queryByLabelText("archive-t1")).toBeNull(); // not in QuickBooks
    });

    it("archives via PATCH and drops the row from the active view", async () => {
      const user = userEvent.setup();
      render(<TransactionsTable initialRows={[rows[0], both]} accounts={["American Express"]} />);
      await user.click(screen.getByLabelText("archive-t3"));
      const [url, init] = fetchMock.mock.calls[0];
      expect(url).toBe("/api/plaid/transactions/t3");
      expect(JSON.parse(init.body)).toEqual({ archived: true });
      await waitFor(() => expect(screen.queryByLabelText("archive-t3")).toBeNull());
    });

    it("shows archived rows with Unarchive under the Archived filter", async () => {
      const user = userEvent.setup();
      const archived: TxnRow = { ...both, transactionId: "t4", archived: true };
      render(<TransactionsTable initialRows={[rows[0], archived]} accounts={["American Express"]} />);
      expect(screen.queryByLabelText("unarchive-t4")).toBeNull(); // hidden in the default Active view

      await user.selectOptions(screen.getByRole("combobox", { name: /status/i }), "archived");
      await user.click(screen.getByLabelText("unarchive-t4"));
      expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ archived: false });
    });
  });

  describe("archive all recorded", () => {
    const both: TxnRow = { ...rows[0], transactionId: "t3", recordedQuickbooks: true, recordedRentvine: true };
    const qbOnlyNR: TxnRow = { ...rows[0], transactionId: "t5", recordedQuickbooks: true, recordedRentvine: false, reimbursable: "no" };

    it("shows the button with a count only when eligible rows exist", () => {
      // t1 (not in QuickBooks) and t2 (QuickBooks only but reimbursable) aren't eligible — no button
      const { unmount } = render(<TransactionsTable initialRows={[rows[0], rows[1]]} accounts={["American Express"]} />);
      expect(screen.queryByRole("button", { name: /archive all recorded/i })).toBeNull();
      unmount();

      // t5 (QuickBooks only + not reimbursable) + t3 (both) are eligible → count 2
      render(<TransactionsTable initialRows={[rows[0], rows[1], qbOnlyNR, both]} accounts={["American Express"]} />);
      expect(screen.getByRole("button", { name: /archive all recorded \(2\)/i })).toBeInTheDocument();
    });

    const archiveOk = (ids: string[]) => ({ ok: true, json: async () => ({ ok: true, archived: ids.length, ids }) });

    it("opens a modal (not a browser dialog) with the breakdown, totals and a preview", async () => {
      const user = userEvent.setup();
      const confirm = vi.spyOn(window, "confirm");
      render(<TransactionsTable initialRows={[rows[0], rows[1], qbOnlyNR, both]} accounts={["American Express"]} />);

      await user.click(screen.getByRole("button", { name: /archive all recorded/i }));
      expect(confirm).not.toHaveBeenCalled();
      const dialog = screen.getByRole("dialog", { name: /archive 2 transactions/i });
      expect(within(dialog).getByText(/1 in both QuickBooks and Rentvine/)).toBeInTheDocument();
      expect(within(dialog).getByText(/1 in QuickBooks only \(not reimbursable\)/)).toBeInTheDocument();
      expect(within(dialog).getAllByText("$100.00").length).toBeGreaterThan(0); // group totals + preview amounts
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it("archives from the modal in one bulk request, then offers Undo for that batch", async () => {
      const user = userEvent.setup();
      fetchMock.mockResolvedValueOnce(archiveOk(["t3", "t5"]));
      render(<TransactionsTable initialRows={[rows[0], rows[1], qbOnlyNR, both]} accounts={["American Express"]} />);

      await user.click(screen.getByRole("button", { name: /archive all recorded/i }));
      await user.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Archive 2" }));
      const [url, init] = fetchMock.mock.calls[0];
      expect(url).toBe("/api/plaid/transactions");
      expect(JSON.parse(init.body)).toEqual({ archiveAllRecorded: true });
      await waitFor(() => expect(screen.queryByLabelText("archive-t3")).toBeNull());
      expect(screen.queryByRole("dialog")).toBeNull();

      // Undo puts back exactly the batch the server archived
      expect(screen.getByText(/Archived 2 transactions/)).toBeInTheDocument();
      await user.click(screen.getByRole("button", { name: "Undo" }));
      expect(JSON.parse(fetchMock.mock.calls[1][1].body)).toEqual({ unarchiveIds: ["t3", "t5"] });
      await waitFor(() => expect(screen.getByLabelText("archive-t3")).toBeInTheDocument());
    });

    it("Review first narrows the table to exactly the batch, which can be archived from there", async () => {
      const user = userEvent.setup();
      fetchMock.mockResolvedValueOnce(archiveOk(["t3", "t5"]));
      render(<TransactionsTable initialRows={[rows[0], rows[1], qbOnlyNR, both]} accounts={["American Express"]} />);

      await user.click(screen.getByRole("button", { name: /archive all recorded/i }));
      await user.click(screen.getByRole("button", { name: "Review first" }));
      expect(screen.queryByRole("dialog")).toBeNull();
      expect(screen.getByText(/Showing 2 ready to archive/)).toBeInTheDocument();
      expect(screen.queryByText("Lowe's")).toBeNull(); // t2 isn't in the batch
      expect(screen.getByLabelText("archive-t3")).toBeInTheDocument();

      await user.click(screen.getByRole("button", { name: "Archive these (2)" }));
      expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ archiveAllRecorded: true });
      await waitFor(() => expect(screen.queryByText(/Showing 2 ready to archive/)).toBeNull());
    });

    it("does nothing when the modal is cancelled", async () => {
      const user = userEvent.setup();
      render(<TransactionsTable initialRows={[rows[0], both]} accounts={["American Express"]} />);
      await user.click(screen.getByRole("button", { name: /archive all recorded/i }));
      await user.click(screen.getByRole("button", { name: "Cancel" }));
      expect(screen.queryByRole("dialog")).toBeNull();
      expect(fetchMock).not.toHaveBeenCalled();
    });
  });

  describe("billed in Rentvine (by property)", () => {
    const BILLS = "https://pmilighthouse.rentvine.com/accounting/bills/";
    const properties = [
      { label: "19 Colgate Road · Huntington", propertyId: "pmilighthouse:property:36", unitId: null },
      { label: "66 Francis Court · Elmont", propertyId: "pmilighthouse:property:12", unitId: null },
    ];
    const cand = {
      kind: "line" as const,
      billId: "2985",
      amount: 472.19,
      date: "2026-11-10",
      description: "Village Permit for HVAC",
      payee: "PMI Lighthouse Reimbursable",
      reference: "",
      properties: ["36"],
    };
    const permit: TxnRow = {
      ...rows[0],
      transactionId: "p1",
      amount: 472.19,
      postedDate: "2026-11-07",
      propertyId: "pmilighthouse:property:36",
      rvCandidates: [cand],
    };
    const unbilled: TxnRow = { ...rows[1], transactionId: "p2", amount: 55, rvCandidates: [] };
    const renderBills = (r: TxnRow[]) => {
      const user = userEvent.setup();
      render(<TransactionsTable initialRows={r} accounts={[]} properties={properties} rentvineBillUrl={BILLS} />);
      return { user };
    };

    it("shows Billed, linking to the Rentvine bill, when the amount was billed on the tagged property", () => {
      renderBills([permit, unbilled]);
      const cell = screen.getByLabelText("rv-billed-p1");
      expect(cell).toHaveTextContent(/billed/i);
      expect(within(cell).getByRole("link")).toHaveAttribute("href", `${BILLS}2985`);
      expect(screen.getByLabelText("rv-billed-p2")).toHaveTextContent(/not billed/i);
    });

    it("re-checks when the property changes — billed elsewhere becomes a possible match", async () => {
      const { user } = renderBills([permit]);
      const input = screen.getByLabelText("property-p1");
      await user.clear(input);
      await user.type(input, "66 Francis Court · Elmont{Enter}");
      const cell = screen.getByLabelText("rv-billed-p1");
      expect(cell).toHaveTextContent(/possible/i);
      expect(cell).toHaveTextContent("19 Colgate Road · Huntington");
    });

    it("is a possible match when no property is tagged yet", () => {
      renderBills([{ ...permit, propertyId: null }]);
      expect(screen.getByLabelText("rv-billed-p1")).toHaveTextContent(/possible/i);
    });

    it("filters to what still needs billing", async () => {
      const { user } = renderBills([permit, unbilled]);
      await user.selectOptions(screen.getByRole("combobox", { name: /billed in rentvine/i }), "not_found");
      expect(screen.queryByLabelText("rv-billed-p1")).toBeNull();
      expect(screen.getByLabelText("rv-billed-p2")).toBeInTheDocument();
    });

    it("turns the check off for charges marked not reimbursable — no bill is needed", async () => {
      const { user } = renderBills([{ ...unbilled, reimbursable: "no" }, { ...unbilled, transactionId: "p3" }]);
      const cell = screen.getByLabelText("rv-billed-p2");
      expect(cell).toHaveTextContent("—");
      expect(cell).not.toHaveTextContent(/not billed/i);
      expect(within(cell).getByTitle(/not reimbursable/i)).toBeInTheDocument();
      // and it drops out of the "Not billed" filter
      await user.selectOptions(screen.getByRole("combobox", { name: /billed in rentvine/i }), "not_found");
      expect(screen.queryByLabelText("rv-billed-p2")).toBeNull();
      expect(screen.getByLabelText("rv-billed-p3")).toBeInTheDocument();
    });

    it("shows nothing for credits or before the bill sync has run", () => {
      renderBills([{ ...permit, rvCandidates: undefined }, { ...unbilled, amount: -20 }]);
      expect(screen.getByLabelText("rv-billed-p1")).toHaveTextContent("—");
      expect(screen.getByLabelText("rv-billed-p2")).toHaveTextContent("—");
    });
  });

  it("picks up new rows when the server sends a fresh list (e.g. after an import) without a page reload", () => {
    const { rerender } = render(<TransactionsTable initialRows={rows} accounts={["American Express", "The Home Depot"]} />);
    expect(screen.queryByText("Invoice 8513573 · PO FHOUSE")).not.toBeInTheDocument();
    const imported: TxnRow = {
      ...rows[0],
      transactionId: "hd:8513573",
      postedDate: "2026-11-04",
      accountName: "Home Depot Pro",
      merchantName: "The Home Depot",
      name: "Invoice 8513573 · PO FHOUSE",
      amount: 27.06,
    };
    rerender(
      <TransactionsTable initialRows={[imported, ...rows]} accounts={["American Express", "Home Depot Pro", "The Home Depot"]} />
    );
    expect(screen.getByText("$27.06")).toBeInTheDocument();
  });
});
