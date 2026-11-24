// @vitest-environment jsdom
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { OwnerDraws } from "@/app/(app)/accounting/owner-draws/OwnerDraws";
import { buildDrawRows, type DrawRecord } from "@/lib/owner-draws";

const push = vi.fn();
const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push, refresh }) }));

const rec = (r: Partial<DrawRecord> = {}): DrawRecord => ({
  portfolioId: "75",
  balanceOverride: null,
  reserveOverride: null,
  unpaidOverride: null,
  note: "",
  approvedAt: null,
  approvedBy: null,
  paidAt: null,
  paidBy: null,
  snapshot: null,
  ...r,
});

const live = [
  { portfolioId: "75", name: "Grant Holdings", owners: ["Ann Owner"], balance: 3000, reserve: 500, unpaid: 100, hold: false },
  { portfolioId: "9", name: "Able Trust", owners: [], balance: 172.56, reserve: 500, unpaid: 250, hold: true },
];
const bills = new Map([
  [
    "75",
    [
      { billId: "1", description: "Pest Control", amount: 30, dateDue: "2026-11-15" },
      { billId: "2", description: "Mgt Fee", amount: 70, dateDue: "2026-11-01" },
    ],
  ],
]);
const rows = (records: DrawRecord[] = [], previous: DrawRecord[] = []) => buildDrawRows({ live, bills, records, previous });

let fetchMock: ReturnType<typeof vi.fn>;
const answer = (record: DrawRecord) => ({ ok: true, json: async () => ({ record }) });
beforeEach(() => {
  fetchMock = vi.fn(async () => answer(rec()));
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

const view = (over: Partial<Parameters<typeof OwnerDraws>[0]> = {}) =>
  render(
    <OwnerDraws
      month="2026-11"
      months={["2026-11", "2026-10"]}
      isCurrent
      initialRows={rows()}
      canApprove
      rentvineAccount="acme"
      {...over}
    />
  );
const rowOf = (name: string) => screen.getByRole("row", { name: new RegExp(name) });
const sentBodies = () => fetchMock.mock.calls.map((c) => JSON.parse(String((c[1] as RequestInit).body)));

describe("OwnerDraws", () => {
  it("lists each owner with Rentvine's numbers and the amount due", () => {
    view();
    const g = rowOf("Grant Holdings");
    expect(within(g).getByLabelText("Balance for Grant Holdings")).toHaveValue("3,000.00");
    expect(within(g).getByLabelText("Reserve for Grant Holdings")).toHaveValue("500.00");
    expect(within(g).getByLabelText("Unpaid bills for Grant Holdings")).toHaveValue("100.00");
    expect(within(g).getByTestId("due-75")).toHaveTextContent("$2,400.00");
    // Negative due and a Rentvine hold are flagged.
    const a = rowOf("Able Trust");
    expect(within(a).getByTestId("due-9")).toHaveTextContent("-$577.44");
    expect(within(a).getByText(/hold/i)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /open grant holdings in rentvine/i })).toHaveAttribute(
      "href",
      "https://acme.rentvine.com/portfolios/75"
    );
  });

  it("editing the reserve saves it and recalculates the amount due", async () => {
    fetchMock.mockResolvedValueOnce(answer(rec({ reserveOverride: 250 })));
    view();
    const input = screen.getByLabelText("Reserve for Grant Holdings");
    await userEvent.clear(input);
    await userEvent.type(input, "250");
    await userEvent.tab();
    expect(sentBodies()[0]).toEqual({ month: "2026-11", portfolioId: "75", action: "set", field: "reserve", value: 250 });
    expect(screen.getByTestId("due-75")).toHaveTextContent("$2,650.00");
    // Shows what Rentvine says and offers a reset.
    expect(within(rowOf("Grant Holdings")).getByText(/Rentvine: \$500\.00/)).toBeInTheDocument();
    fetchMock.mockResolvedValueOnce(answer(rec()));
    await userEvent.click(screen.getByRole("button", { name: "Reset reserve for Grant Holdings" }));
    expect(sentBodies()[1]).toMatchObject({ action: "set", field: "reserve", value: null });
    expect(screen.getByTestId("due-75")).toHaveTextContent("$2,400.00");
  });

  it("shows the bills behind the unpaid amount", async () => {
    view();
    await userEvent.click(screen.getByRole("button", { name: "2 bills" }));
    expect(screen.getByText("Pest Control")).toBeInTheDocument();
    expect(screen.getByText("Mgt Fee")).toBeInTheDocument();
  });

  it("approves with the amount on screen, and marks paid", async () => {
    const snapshot = { name: "Grant Holdings", owners: ["Ann Owner"], balance: 3000, reserve: 500, unpaid: 100, hold: false, bills: [] };
    fetchMock.mockResolvedValueOnce(answer(rec({ approvedAt: "2026-11-05T14:00:00Z", approvedBy: "Boss", snapshot })));
    view();
    await userEvent.click(screen.getByRole("checkbox", { name: "Approve Grant Holdings" }));
    expect(sentBodies()[0]).toEqual({ month: "2026-11", portfolioId: "75", action: "approve", expectDue: 2400 });
    expect(screen.getByRole("checkbox", { name: "Approve Grant Holdings" })).toBeChecked();
    expect(within(rowOf("Grant Holdings")).getByText(/Boss/)).toBeInTheDocument();

    fetchMock.mockResolvedValueOnce(
      answer(rec({ approvedAt: "2026-11-05T14:00:00Z", approvedBy: "Boss", paidAt: "2026-11-05T15:00:00Z", paidBy: "JR", snapshot }))
    );
    await userEvent.click(screen.getByRole("checkbox", { name: "Paid Grant Holdings" }));
    expect(sentBodies()[1]).toMatchObject({ action: "paid" });
    expect(screen.getByRole("checkbox", { name: "Paid Grant Holdings" })).toBeChecked();
    // Paid rows lock their numbers.
    expect(screen.getByLabelText("Reserve for Grant Holdings")).toBeDisabled();
  });

  it("only the approver can tick Approve", () => {
    view({ canApprove: false });
    expect(screen.getByRole("checkbox", { name: "Approve Grant Holdings" })).toBeDisabled();
    expect(screen.getByRole("checkbox", { name: "Paid Grant Holdings" })).toBeEnabled();
  });

  it("shows the server's message when a save is refused", async () => {
    fetchMock.mockResolvedValueOnce({ ok: false, json: async () => ({ error: "Rentvine's numbers changed" }) });
    view();
    await userEvent.click(screen.getByRole("checkbox", { name: "Approve Grant Holdings" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Rentvine's numbers changed");
    expect(screen.getByRole("checkbox", { name: "Approve Grant Holdings" })).not.toBeChecked();
  });

  it("shows each owner's latest note and opens the notes thread", async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ notes: [], staff: [], me: "", canModerate: true }) });
    view({
      noteSummaries: { "75": { count: 2, latest: "Charge next month: fridge $890", latestAt: "2026-11-01T00:00:00Z", latestBy: "JR" } },
    });
    expect(within(rowOf("Grant Holdings")).getByText("Charge next month: fridge $890")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Notes for Grant Holdings" }));
    expect(await screen.findByRole("dialog", { name: "Notes for Grant Holdings" })).toBeInTheDocument();
    expect(String(fetchMock.mock.calls[0][0])).toBe("/api/accounting/owner-draw-notes?portfolio=75");
  });

  it("takes fresh rows from the server after a refresh", () => {
    const { rerender } = view();
    const fresh = buildDrawRows({
      live: [{ ...live[0], balance: 4000 }, live[1]],
      bills,
      records: [],
      previous: [],
    });
    rerender(
      <OwnerDraws month="2026-11" months={["2026-11"]} isCurrent initialRows={fresh} canApprove rentvineAccount="acme" />
    );
    expect(screen.getByTestId("due-75")).toHaveTextContent("$3,400.00");
  });

  it("filters to rows waiting on approval, and totals what's due", async () => {
    view();
    expect(screen.getByTestId("total-due")).toHaveTextContent("$2,400.00");
    await userEvent.type(screen.getByPlaceholderText(/search owners/i), "able");
    expect(screen.queryByRole("row", { name: /Grant Holdings/ })).not.toBeInTheDocument();
  });

  it("switches month", async () => {
    view();
    await userEvent.selectOptions(screen.getByLabelText("Month"), "2026-10");
    expect(push).toHaveBeenCalledWith("/accounting/owner-draws?month=2026-10");
  });
});
