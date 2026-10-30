// @vitest-environment jsdom
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

import { TransactionFiltersManager } from "@/app/(app)/admin/transaction-filters/TransactionFiltersManager";

const rules = [
  { id: 1, pattern: "*CSG FORTE*", comment: "Rentvine ACH fees", createdBy: "admin@pmi.com", createdAt: "2026-10-30T12:00:00.000Z" },
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

describe("TransactionFiltersManager", () => {
  it("lists each rule with its comment", () => {
    render(<TransactionFiltersManager initialRules={rules} />);
    const row = screen.getByText("*CSG FORTE*").closest("tr")!;
    expect(within(row).getByDisplayValue("Rentvine ACH fees")).toBeTruthy();
  });

  it("adds a rule with a comment", async () => {
    const user = userEvent.setup();
    render(<TransactionFiltersManager initialRules={[]} />);

    await user.type(screen.getByLabelText(/pattern/i), "*AMAZON*");
    await user.type(screen.getByLabelText(/comment/i), "Personal card spend");
    await user.click(screen.getByRole("button", { name: /add filter/i }));

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("/api/admin/transaction-filters");
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body)).toEqual({ pattern: "*AMAZON*", comment: "Personal card spend" });
  });

  it("won't add a rule without a comment", async () => {
    const user = userEvent.setup();
    render(<TransactionFiltersManager initialRules={[]} />);
    await user.type(screen.getByLabelText(/pattern/i), "*AMAZON*");
    expect((screen.getByRole("button", { name: /add filter/i }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("saves an edited comment when you leave the field", async () => {
    const user = userEvent.setup();
    render(<TransactionFiltersManager initialRules={rules} />);
    const box = screen.getByDisplayValue("Rentvine ACH fees");
    await user.clear(box);
    await user.type(box, "Card processing fees");
    await user.tab();

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("/api/admin/transaction-filters?id=1");
    expect(init.method).toBe("PATCH");
    expect(JSON.parse(init.body)).toEqual({ comment: "Card processing fees" });
  });

  it("removes a rule", async () => {
    const user = userEvent.setup();
    render(<TransactionFiltersManager initialRules={rules} />);
    await user.click(screen.getByRole("button", { name: /remove \*CSG FORTE\*/i }));

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("/api/admin/transaction-filters?id=1");
    expect(init.method).toBe("DELETE");
    expect(screen.queryByText("*CSG FORTE*")).toBeNull();
  });
});
