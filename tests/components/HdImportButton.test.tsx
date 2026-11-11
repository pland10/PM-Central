// @vitest-environment jsdom
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));

import { HdImportButton } from "@/app/(app)/accounting/transactions/HdImportButton";

const CSV = "Invoices by Statement Date\nInvoice Date,Invoice Number,Purchase Order,Amount Due\nNov 07 2026,5533628,,$20.62\n";
const file = () => new File([CSV], "2026-11-11.csv", { type: "text/csv" });
const fetchMock = vi.fn();

beforeEach(() => {
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe("HdImportButton", () => {
  it("uploads the chosen CSV, reports new vs updated, and refreshes the table", async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ ok: true, imported: 5, updated: 1, errors: [] }), { status: 200 }));
    render(<HdImportButton />);
    await userEvent.upload(screen.getByLabelText(/import home depot pro csv/i), file());

    await waitFor(() => expect(screen.getByText(/5 new, 1 already imported/i)).toBeInTheDocument());
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("/api/plaid/import-hd");
    expect(JSON.parse(init.body)).toEqual({ csv: CSV });
    expect(refresh).toHaveBeenCalled();
  });

  it("mentions lines it couldn't read", async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ ok: true, imported: 1, updated: 0, errors: ["Line 4: couldn't read \"x\""] }), { status: 200 })
    );
    render(<HdImportButton />);
    await userEvent.upload(screen.getByLabelText(/import home depot pro csv/i), file());
    await waitFor(() => expect(screen.getByText(/1 line skipped/i)).toBeInTheDocument());
  });

  it("shows the server's error for the wrong file and doesn't refresh", async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ error: "This doesn't look like a Home Depot Pro invoice export." }), { status: 400 }));
    render(<HdImportButton />);
    await userEvent.upload(screen.getByLabelText(/import home depot pro csv/i), file());
    await waitFor(() => expect(screen.getByText(/doesn't look like a home depot pro/i)).toBeInTheDocument());
    expect(refresh).not.toHaveBeenCalled();
  });
});
