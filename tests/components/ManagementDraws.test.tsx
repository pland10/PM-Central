// @vitest-environment jsdom
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ManagementDraws } from "@/app/(app)/accounting/ManagementDraws";
import type { ManagementDrawRow, BatchWithItems } from "@/lib/payout-batches";

const rows: ManagementDrawRow[] = [
  { payoutId: "a", bankAccount: "Residential Trust", date: "2026-08-10", payee: "PMI Lighthouse", payeeType: "Manager", method: "eCheck (ACH)", checkNumber: "", memo: "Mgmt fees", amount: 100, batched: false, batchId: null, batchedAt: null },
  { payoutId: "b", bankAccount: "Security Deposit", date: "2026-08-11", payee: "PMI Lighthouse Reimbursable", payeeType: "Vendor", method: "Check", checkNumber: "31", memo: "Reimb", amount: 50, batched: false, batchId: null, batchedAt: null },
];

const batches: BatchWithItems[] = [
  {
    id: 3,
    createdAt: "2026-08-02T00:00:00Z",
    createdBy: "",
    note: "July draw",
    count: 1,
    total: 999,
    confirmed: true, // already confirmed → screen not locked
    confirmedAt: "2026-08-03T00:00:00Z",
    items: [{ payoutId: "c", payee: "PMI Lighthouse", bankAccount: "Residential Trust", memo: "old", postedDate: "2026-08-01", amount: 999 }],
  },
];

let fetchMock: ReturnType<typeof vi.fn>;
beforeEach(() => {
  fetchMock = vi.fn(async () => ({ ok: true, json: async () => ({ ok: true, batchId: 5, count: 2, total: 150 }) }));
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

function setup() {
  const user = userEvent.setup();
  render(<ManagementDraws initialRows={rows} batches={batches} asOf="Oct 30, 2026" rentvineAccount="pmilighthouse" />);
  return { user };
}

function drawsTable() {
  // the To-draw table is the first table on the page
  return document.querySelectorAll("table")[0];
}

describe("ManagementDraws", () => {
  it("keeps batched payments off the To-draw list (they live under Batches)", () => {
    setup();
    expect(within(drawsTable()).getByText("Mgmt fees")).toBeInTheDocument(); // row a (open)
    expect(within(drawsTable()).queryByText("old")).toBeNull(); // row c is batched, not in draws
    expect(screen.getByLabelText("batch-3")).toBeInTheDocument(); // shown under Batches
  });

  it("links each open draw to its payment in Rentvine by payout id", () => {
    setup();
    const link = within(drawsTable()).getByLabelText("open-in-rentvine-a") as HTMLAnchorElement;
    expect(link).toHaveAttribute("href", "https://pmilighthouse.rentvine.com/accounting/payables/payouts/a");
    expect(link).toHaveAttribute("target", "_blank");
  });

  it("links each batched payment to its Rentvine payment too", async () => {
    const { user } = setup();
    await user.click(screen.getByLabelText("batch-3")); // expand the batch
    const link = screen.getByLabelText("open-in-rentvine-c") as HTMLAnchorElement;
    expect(link).toHaveAttribute("href", "https://pmilighthouse.rentvine.com/accounting/payables/payouts/c");
  });

  it("select-all header checkbox selects and deselects every open row", async () => {
    const { user } = setup();
    await user.click(screen.getByRole("button", { name: /pay the management company/i }));
    await user.click(screen.getByLabelText("select-all"));
    expect((screen.getByLabelText("select-a") as HTMLInputElement).checked).toBe(true);
    expect((screen.getByLabelText("select-b") as HTMLInputElement).checked).toBe(true);
    await user.click(screen.getByLabelText("select-all"));
    expect((screen.getByLabelText("select-a") as HTMLInputElement).checked).toBe(false);
  });

  it("Cancel backs out of the Pay flow and clears the selection", async () => {
    const { user } = setup();
    await user.click(screen.getByRole("button", { name: /pay the management company/i }));
    await user.click(screen.getByLabelText("select-a"));
    expect(screen.getByRole("button", { name: /lock in batch/i })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /^cancel$/i }));
    // Back to the start: the Pay button returns and the batch controls are gone.
    expect(screen.getByRole("button", { name: /pay the management company/i })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /lock in batch/i })).toBeNull();
    // Re-opening starts with nothing selected.
    await user.click(screen.getByRole("button", { name: /pay the management company/i }));
    expect((screen.getByLabelText("select-a") as HTMLInputElement).checked).toBe(false);
  });

  it("locks a batch with a note and shows the per-account move instruction", async () => {
    const { user } = setup();
    await user.click(screen.getByRole("button", { name: /pay the management company/i }));
    await user.click(screen.getByLabelText("select-all"));
    await user.type(screen.getByLabelText("Batch note"), "August");

    expect(screen.getByText(/2 selected · \$150/)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /lock in batch/i }));

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("/api/accounting/payout-batches");
    const body = JSON.parse(init.body);
    expect(body.note).toBe("August");
    expect(body.items.map((i: { payoutId: string }) => i.payoutId).sort()).toEqual(["a", "b"]);

    expect(await screen.findByText(/Batch #5 locked/)).toBeInTheDocument();
    expect(screen.getByText(/from Residential Trust/)).toBeInTheDocument();
    expect(screen.getByText(/from Security Deposit/)).toBeInTheDocument();
  });

  it("locks the screen while a batch is unconfirmed, allows only remove, and unlocks on confirm", async () => {
    const pending: BatchWithItems[] = [
      { id: 7, createdAt: "2026-08-20T00:00:00Z", createdBy: "", note: "", count: 1, total: 100, confirmed: false, confirmedAt: null, items: [{ payoutId: "a", payee: "PMI Lighthouse", bankAccount: "Residential Trust", memo: "fees", postedDate: "2026-08-10", amount: 100 }] },
    ];
    const user = userEvent.setup();
    render(<ManagementDraws initialRows={[rows[1]]} batches={pending} asOf="" rentvineAccount="pmilighthouse" />); // one open row so "Pay" could be enabled

    // Locked: can't start a new batch; told the screen is locked.
    expect(screen.getByRole("button", { name: /pay the management company/i })).toBeDisabled();
    expect(screen.getByText(/this screen is locked/i)).toBeInTheDocument();
    expect(screen.getByText(/Batch #7 locked/)).toBeInTheDocument();

    // But you can still drill in and remove a payment from the pending batch.
    await user.click(screen.getByLabelText("batch-7"));
    expect(screen.getByLabelText("remove-a")).toBeInTheDocument();

    // Confirming the money moved unlocks the screen.
    fetchMock.mockResolvedValueOnce({ ok: true, json: async () => ({ ok: true, batchId: 7 }) });
    await user.click(screen.getByRole("button", { name: /confirm money moved/i }));
    expect(fetchMock.mock.calls[0][0]).toBe("/api/accounting/payout-batches/confirm");
    expect(await screen.findByRole("button", { name: /pay the management company/i })).not.toBeDisabled();
  });

  it("takes the Chase transaction number on confirm and shows it on the batch", async () => {
    const pending: BatchWithItems[] = [
      { id: 7, createdAt: "2026-08-20T00:00:00Z", createdBy: "", note: "", count: 1, total: 100, confirmed: false, confirmedAt: null, items: [{ payoutId: "a", payee: "PMI Lighthouse", bankAccount: "Residential Trust", memo: "fees", postedDate: "2026-08-10", amount: 100 }] },
    ];
    const user = userEvent.setup();
    render(<ManagementDraws initialRows={[rows[1]]} batches={pending} asOf="" rentvineAccount="pmilighthouse" />);

    // The box is there before you click confirm.
    await user.type(screen.getByLabelText(/chase transaction #/i), "CHS-881234");
    fetchMock.mockResolvedValueOnce({ ok: true, json: async () => ({ ok: true, batchId: 7 }) });
    await user.click(screen.getByRole("button", { name: /confirm money moved/i }));

    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ batchId: 7, bankReference: "CHS-881234" });
    expect(within(screen.getByLabelText("batch-7")).getByText(/CHS-881234/)).toBeInTheDocument();
  });

  it("shows a confirmed batch's Chase transaction number", () => {
    render(<ManagementDraws initialRows={rows} batches={[{ ...batches[0], bankReference: "CHS-1" }]} asOf="" rentvineAccount="pmilighthouse" />);
    expect(within(screen.getByLabelText("batch-3")).getByText(/Chase # CHS-1/)).toBeInTheDocument();
  });

  it("edits the Chase transaction # on a confirmed batch", async () => {
    const user = userEvent.setup();
    render(<ManagementDraws initialRows={rows} batches={[{ ...batches[0], bankReference: "CHS-1" }]} asOf="" rentvineAccount="pmilighthouse" />);
    await user.click(screen.getByRole("button", { name: "edit-chase-3" }));
    const box = screen.getByLabelText("chase-3");
    expect(box).toHaveValue("CHS-1");
    await user.clear(box);
    await user.type(box, "CHS-9");
    fetchMock.mockResolvedValueOnce({ ok: true, json: async () => ({ ok: true, batchId: 3, bankReference: "CHS-9" }) });
    await user.click(screen.getByRole("button", { name: "Save" }));

    expect(fetchMock.mock.calls[0][0]).toBe("/api/accounting/payout-batches/reference");
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ batchId: 3, bankReference: "CHS-9" });
    expect(await within(screen.getByLabelText("batch-3")).findByText(/Chase # CHS-9/)).toBeInTheDocument();
    expect(screen.queryByLabelText("chase-3")).not.toBeInTheDocument();
  });

  it("offers to add a Chase # to a confirmed batch that has none, and keeps the box open on a failed save", async () => {
    const user = userEvent.setup();
    render(<ManagementDraws initialRows={rows} batches={batches} asOf="" rentvineAccount="pmilighthouse" />);
    await user.click(screen.getByRole("button", { name: "edit-chase-3" }));
    await user.type(screen.getByLabelText("chase-3"), "CHS-5");
    fetchMock.mockResolvedValueOnce({ ok: false, status: 500, json: async () => ({ error: "Could not save the transaction #." }) });
    await user.click(screen.getByRole("button", { name: "Save" }));
    expect(await screen.findByText(/could not save the transaction #/i)).toBeInTheDocument();
    expect(screen.getByLabelText("chase-3")).toHaveValue("CHS-5");
    expect(within(screen.getByLabelText("batch-3")).queryByText(/Chase #/)).not.toBeInTheDocument();
  });

  it("doesn't offer the edit on a batch that isn't confirmed yet (the banner box is for that)", () => {
    const pending: BatchWithItems[] = [{ ...batches[0], id: 7, confirmed: false, confirmedAt: null }];
    render(<ManagementDraws initialRows={rows} batches={pending} asOf="" rentvineAccount="pmilighthouse" />);
    expect(screen.queryByRole("button", { name: "edit-chase-7" })).not.toBeInTheDocument();
  });

  it("drills into a batch and pulls an item back out, telling you to move it back", async () => {
    const { user } = setup();
    await user.click(screen.getByLabelText("batch-3")); // expand
    expect(screen.getByText("old")).toBeInTheDocument(); // item c now visible

    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ ok: true, removed: { payoutId: "c", amount: 999, bankAccount: "Residential Trust", batchId: 3 }, batchEmptied: true }),
    });
    await user.click(screen.getByLabelText("remove-c"));

    // reverse instruction: move it back from Operating
    expect(await screen.findByText(/pulled a payment back out of batch #3/i)).toBeInTheDocument();
    expect(screen.getByText("$999.00")).toBeInTheDocument();
    // batch emptied → gone
    expect(screen.queryByLabelText("batch-3")).toBeNull();
  });
});
