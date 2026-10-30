// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ManagementDraws } from "@/app/(app)/accounting/ManagementDraws";
import type { ManagementDrawRow } from "@/lib/payout-batches";

const rows: ManagementDrawRow[] = [
  { payoutId: "a", date: "2026-08-10", payee: "PMI Lighthouse", payeeType: "Manager", method: "eCheck (ACH)", checkNumber: "", memo: "Mgmt fees", amount: 100, batched: false, batchId: null, batchedAt: null },
  { payoutId: "b", date: "2026-08-11", payee: "PMI Lighthouse Reimbursable", payeeType: "Vendor", method: "Check", checkNumber: "31", memo: "Reimb", amount: 50, batched: false, batchId: null, batchedAt: null },
  { payoutId: "c", date: "2026-08-01", payee: "PMI Lighthouse", payeeType: "Manager", method: "eCheck (ACH)", checkNumber: "", memo: "old", amount: 999, batched: true, batchId: 3, batchedAt: "2026-08-02T00:00:00Z" },
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
  render(<ManagementDraws initialRows={rows} recentBatches={[]} asOf="Oct 30, 2026" />);
  return { user };
}

describe("ManagementDraws", () => {
  it("only offers checkboxes on un-batched rows once selecting", async () => {
    const { user } = setup();
    expect(screen.queryByLabelText("select-a")).toBeNull(); // not selecting yet
    await user.click(screen.getByRole("button", { name: /pay the management company/i }));
    expect(screen.getByLabelText("select-a")).toBeInTheDocument();
    expect(screen.getByLabelText("select-b")).toBeInTheDocument();
    expect(screen.queryByLabelText("select-c")).toBeNull(); // already batched
  });

  it("totals the selection, locks a batch, and tells you to move the money", async () => {
    const { user } = setup();
    await user.click(screen.getByRole("button", { name: /pay the management company/i }));
    await user.click(screen.getByLabelText("select-a"));
    await user.click(screen.getByLabelText("select-b"));

    expect(screen.getByText(/2 selected/)).toBeInTheDocument();
    expect(screen.getByText(/2 selected · \$150/)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /lock in batch/i }));

    // posted the two selected payouts
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("/api/accounting/payout-batches");
    const body = JSON.parse(init.body);
    expect(body.items.map((i: { payoutId: string }) => i.payoutId).sort()).toEqual(["a", "b"]);

    // confirmation + move-the-money instruction
    expect(await screen.findByText(/Batch #5 locked/)).toBeInTheDocument();
    expect(screen.getByText(/Trust/)).toBeInTheDocument();
    expect(screen.getByText(/Operating/)).toBeInTheDocument();

    // the two rows now read as batched under #5
    expect(screen.getAllByText(/Batched · #5/)).toHaveLength(2);
  });

  it("surfaces a lock failure", async () => {
    fetchMock.mockResolvedValueOnce({ ok: false, json: async () => ({ error: "Those payments were already batched." }) });
    const { user } = setup();
    await user.click(screen.getByRole("button", { name: /pay the management company/i }));
    await user.click(screen.getByLabelText("select-a"));
    await user.click(screen.getByRole("button", { name: /lock in batch/i }));
    expect(await screen.findByText(/already batched/i)).toBeInTheDocument();
  });
});
