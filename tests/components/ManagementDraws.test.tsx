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
  render(<ManagementDraws initialRows={rows} batches={batches} asOf="Oct 30, 2026" />);
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

  it("select-all header checkbox selects and deselects every open row", async () => {
    const { user } = setup();
    await user.click(screen.getByRole("button", { name: /pay the management company/i }));
    await user.click(screen.getByLabelText("select-all"));
    expect((screen.getByLabelText("select-a") as HTMLInputElement).checked).toBe(true);
    expect((screen.getByLabelText("select-b") as HTMLInputElement).checked).toBe(true);
    await user.click(screen.getByLabelText("select-all"));
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
    expect(screen.getByText("$999")).toBeInTheDocument();
    // batch emptied → gone
    expect(screen.queryByLabelText("batch-3")).toBeNull();
  });
});
