// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const refresh = vi.fn();
const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh, push }) }));

import { ReceiptEditor } from "@/app/(app)/invoicing/receipts/[id]/ReceiptEditor";
import { ReceiptsList } from "@/app/(app)/invoicing/receipts/ReceiptsList";

const receipt = {
  id: "r1", number: "PMI-R-0009", billingParty: "pmi", inspector: "Ari", paidOn: "2026-11-03",
  method: "Zelle", reference: null, notes: null,
  items: [{ property: "6 Harbor Ln", at: "2026-11-01", amount: 45 }, { property: "4072 Darby Ln", at: "2026-10-01", amount: 40 }],
};
let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  fetchMock = vi.fn(async () => ({ ok: true, json: async () => ({ id: "new" }) }));
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe("ReceiptEditor", () => {
  it("totals the visits and flags an address that has left the programme", () => {
    render(<ReceiptEditor receipt={receipt} addresses={["6 Harbor Ln", "47 Columbine Ave"]} />);
    expect(screen.getByText("$85.00")).toBeTruthy();
    expect(screen.getByText("no longer in the programme")).toBeTruthy();
  });

  it("adds a line and saves the receipt", async () => {
    const user = userEvent.setup();
    render(<ReceiptEditor receipt={receipt} addresses={["6 Harbor Ln", "47 Columbine Ave"]} />);
    await user.click(screen.getByRole("button", { name: "+ Add inspection" }));
    await user.selectOptions(screen.getByLabelText("Property 3"), "47 Columbine Ave");
    await user.type(screen.getByLabelText("Amount 3"), "50");
    await user.click(screen.getByRole("button", { name: "Save" }));

    expect(fetchMock.mock.calls[0][0]).toBe("/api/invoicing/receipts/r1");
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.items[2]).toEqual({ property: "47 Columbine Ave", at: "", amount: "50" });
    expect(await screen.findByText("Saved ✓")).toBeTruthy();
  });
});

describe("ReceiptsList", () => {
  it("creates a receipt for the chosen party and opens it", async () => {
    const user = userEvent.setup();
    render(<ReceiptsList receipts={[receipt]} isAdmin={false} />);
    expect(screen.getByText(/\$85\.00 paid out/)).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Delete" })).toBeNull(); // admins only
    await user.selectOptions(screen.getByLabelText("Paid by"), "lms");
    await user.click(screen.getByRole("button", { name: "+ New receipt" }));
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ billing_party: "lms" });
    expect(push).toHaveBeenCalledWith("/invoicing/receipts/new");
  });
});
