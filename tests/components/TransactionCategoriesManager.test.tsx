// @vitest-environment jsdom
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { TransactionCategoriesManager } from "@/app/(app)/admin/transaction-categories/TransactionCategoriesManager";

const categories = [
  { name: "Payroll", count: 10 },
  { name: "pay roll", count: 2 },
  { name: "Supplies", count: 4 },
  { name: "Unused", count: 0 },
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

const rowOf = (name: string) => screen.getByRole("cell", { name }).closest("tr")!;

describe("TransactionCategoriesManager", () => {
  it("flags likely duplicates", () => {
    render(<TransactionCategoriesManager initialCategories={categories} initialOpen />);
    expect(within(rowOf("pay roll")).getByText(/possible duplicate/i)).toBeTruthy();
    expect(within(rowOf("Supplies")).queryByText(/possible duplicate/i)).toBeNull();
  });

  it("merges a duplicate into the right name and folds its count in", async () => {
    const user = userEvent.setup();
    render(<TransactionCategoriesManager initialCategories={categories} initialOpen />);
    await user.selectOptions(within(rowOf("pay roll")).getByRole("combobox", { name: /merge pay roll into/i }), "Payroll");
    await user.click(within(rowOf("pay roll")).getByRole("button", { name: /^merge$/i }));

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("/api/admin/transaction-categories/merge");
    expect(JSON.parse(init.body)).toEqual({ from: "pay roll", to: "Payroll" });
    expect(screen.queryByRole("cell", { name: "pay roll" })).toBeNull();
    expect(within(rowOf("Payroll")).getByText("12")).toBeTruthy();
  });

  it("deletes an unused category, but only offers delete when unused", async () => {
    const user = userEvent.setup();
    render(<TransactionCategoriesManager initialCategories={categories} initialOpen />);
    expect(within(rowOf("Supplies")).queryByRole("button", { name: /delete/i })).toBeNull();
    await user.click(within(rowOf("Unused")).getByRole("button", { name: /delete/i }));
    expect(fetchMock.mock.calls[0][0]).toBe("/api/admin/transaction-categories?name=Unused");
    expect(fetchMock.mock.calls[0][1].method).toBe("DELETE");
  });

  it("adds a category", async () => {
    const user = userEvent.setup();
    render(<TransactionCategoriesManager initialCategories={categories} initialOpen />);
    await user.type(screen.getByLabelText(/new category/i), "Utilities");
    await user.click(screen.getByRole("button", { name: /add category/i }));
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ name: "Utilities" });
    expect(screen.getByRole("cell", { name: "Utilities" })).toBeTruthy();
  });

  it("locks the list so only admins can add new categories", async () => {
    const user = userEvent.setup();
    render(<TransactionCategoriesManager initialCategories={categories} initialOpen />);
    await user.click(screen.getByRole("checkbox", { name: /anyone can add new categories/i }));
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("/api/admin/transaction-categories");
    expect(JSON.parse(init.body)).toEqual({ open: false });
  });
});
