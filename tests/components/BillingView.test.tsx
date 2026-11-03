// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const refresh = vi.fn();
const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh, push }) }));

import { BillingView, type BillingRow } from "@/app/(app)/invoicing/billing/BillingView";

const rows: BillingRow[] = [
  { customerId: "a", name: "Smith Trust", billingParty: "pmi", service: "Squatter watch", rate: 200, invoice: { id: "i1", number: "PMI-0120", status: "sent" } },
  { customerId: "b", name: "Jones LLC", billingParty: "lms", service: "Squatter watch", rate: 300, invoice: null },
];
let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  fetchMock = vi.fn(async () => ({ ok: true, json: async () => ({ created: [], skipped: 0, errors: [] }) }));
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe("BillingView", () => {
  it("shows who is due, who is billed and the gap for the month", () => {
    render(<BillingView periodKey="2026-11" rows={rows} expected={500} hasCustomers />);
    expect(screen.getByText("1 not yet invoiced for November 2026.")).toBeTruthy();
    expect(screen.getByRole("link", { name: "PMI-0120" }).getAttribute("href")).toBe("/invoicing/i1/edit");
    expect(screen.getByText("not billed")).toBeTruthy();
    expect(screen.getByText(/\$500\.00 expected/)).toBeTruthy();
  });

  it("creates all missing invoices for the period, then refreshes", async () => {
    render(<BillingView periodKey="2026-11" rows={rows} expected={500} hasCustomers />);
    await userEvent.setup().click(screen.getByRole("button", { name: "Create 1 missing invoice" }));
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ period_key: "2026-11" });
    expect(refresh).toHaveBeenCalled();
  });

  it("creates one customer's invoice from its row", async () => {
    render(<BillingView periodKey="2026-11" rows={rows} expected={500} hasCustomers />);
    await userEvent.setup().click(screen.getByRole("button", { name: "Create invoice" }));
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ period_key: "2026-11", customer_ids: ["b"] });
  });

  it("says everyone is invoiced when nothing is missing", () => {
    render(<BillingView periodKey="2026-11" rows={[rows[0]]} expected={200} hasCustomers />);
    expect(screen.getByText("Everyone due for November 2026 has been invoiced.")).toBeTruthy();
    expect(screen.queryByRole("button", { name: /missing/ })).toBeNull();
  });
});
