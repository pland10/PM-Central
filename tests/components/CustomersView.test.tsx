// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));

import { CustomersView } from "@/app/(app)/invoicing/customers/CustomersView";

const smith = {
  id: "c1", billingParty: "pmi", name: "Smith Trust", addr: null, contact: null, attn: null,
  service: "Squatter watch", rate: 250, frequency: "monthly", startDate: "2026-03-01", isActive: true,
  rentvinePortfolioId: null, rentvineContactId: null, notes: null,
};
let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  fetchMock = vi.fn(async () => ({ ok: true, json: async () => ({ id: "c2" }) }));
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe("CustomersView", () => {
  it("lists customers with rate and frequency", () => {
    render(<CustomersView customers={[smith]} invoiceCounts={{}} />);
    expect(screen.getByText("Smith Trust")).toBeTruthy();
    expect(screen.getByText("$250.00")).toBeTruthy();
    expect(screen.getByText("Monthly")).toBeTruthy();
  });

  it("adds a customer", async () => {
    const user = userEvent.setup();
    render(<CustomersView customers={[]} invoiceCounts={{}} />);
    await user.click(screen.getByRole("button", { name: "+ New customer" }));
    await user.type(screen.getByPlaceholderText("Who is being billed"), "Jones LLC");
    await user.type(screen.getByLabelText("Rate per period"), "300");
    await user.click(screen.getByRole("button", { name: "Add customer" }));

    expect(fetchMock.mock.calls[0][0]).toBe("/api/invoicing/customers");
    expect(fetchMock.mock.calls[0][1].method).toBe("POST");
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toMatchObject({ name: "Jones LLC", rate: "300", frequency: "monthly" });
    expect(refresh).toHaveBeenCalled();
  });

  it("edits an existing customer", async () => {
    const user = userEvent.setup();
    render(<CustomersView customers={[smith]} invoiceCounts={{}} />);
    await user.click(screen.getByRole("button", { name: "Edit" }));
    await user.click(screen.getByRole("button", { name: "Save changes" }));
    expect(fetchMock.mock.calls[0][0]).toBe("/api/invoicing/customers/c1");
    expect(fetchMock.mock.calls[0][1].method).toBe("PATCH");
  });
});
