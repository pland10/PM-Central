// @vitest-environment jsdom
import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));

import { InvoiceEditor } from "@/app/(app)/invoicing/[id]/edit/InvoiceEditor";
import type { InvoiceRow } from "@/lib/invoices";

const LOADED = "2026-11-26T15:00:00.000Z";
const AFTER_FIRST = "2026-11-26T15:00:05.000Z";

const invoice: InvoiceRow = {
  id: "inv60",
  number: "PMI-0060",
  invoice_date: "2026-11-26",
  due_date: "2026-12-26",
  period: "Monthly Squatter Watch Service — December 2026",
  from_party: null,
  bill_to: { name: "Ross Freeman", addr: "235 West 56th Street #17k", contact: "", extra: "" },
  terms: "Net 30",
  notes: null,
  billing_contact: null,
  tax_rate: 0,
  status: "draft",
  items: [
    { desc: "Monthly Squatter Watch Service", qty: 1, rate: 150 },
    { desc: "hang the paintings / pictures", qty: 1, rate: 200 },
  ],
  billing_party: null,
  customer_id: null,
  period_key: null,
  property_external_id: null,
  deleted_at: null,
  created_at: LOADED,
  updated_at: LOADED,
};

let fetchMock: ReturnType<typeof vi.fn>;
const puts = () =>
  fetchMock.mock.calls
    .filter((c) => (c[1] as RequestInit | undefined)?.method === "PUT")
    .map((c) => ({ body: JSON.parse(String((c[1] as RequestInit).body)), keepalive: (c[1] as RequestInit).keepalive }));

beforeEach(() => {
  vi.useFakeTimers();
  fetchMock = vi.fn(async () => ({ ok: true, json: async () => ({ id: "inv60", updated_at: AFTER_FIRST }) }));
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

const editTerms = (v: string) => fireEvent.change(screen.getByPlaceholderText("Net 30"), { target: { value: v } });
const flush = async () => {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(1100);
  });
};

describe("InvoiceEditor — stale copies can't overwrite a newer save", () => {
  it("sends the version it loaded, then the version the server returns", async () => {
    render(<InvoiceEditor initial={invoice} properties={[]} />);
    editTerms("Net 15");
    await flush();
    editTerms("Net 10");
    await flush();
    expect(puts().map((p) => p.body.base_updated_at)).toEqual([LOADED, AFTER_FIRST]);
    expect(puts()[0].body.items).toHaveLength(2); // the whole invoice, both lines
  });

  it("waits for a slow save before sending the next, so it carries the new version (no false conflict)", async () => {
    let release!: () => void;
    fetchMock
      .mockImplementationOnce(
        () =>
          new Promise((r) => {
            release = () => r({ ok: true, json: async () => ({ id: "inv60", updated_at: AFTER_FIRST }) });
          })
      )
      .mockImplementation(async () => ({ ok: true, json: async () => ({ id: "inv60", updated_at: "2026-11-26T15:00:09.000Z" }) }));
    render(<InvoiceEditor initial={invoice} properties={[]} />);
    editTerms("Net 15");
    await flush(); // first save sent, still in flight
    editTerms("Net 10");
    await flush(); // second save due — must wait for the first
    expect(puts()).toHaveLength(1);
    await act(async () => {
      release();
      await vi.advanceTimersByTimeAsync(10);
    });
    expect(puts().map((p) => p.body.base_updated_at)).toEqual([LOADED, AFTER_FIRST]);
  });

  it("on a conflict, says to reload and stops auto-saving over the newer copy", async () => {
    fetchMock.mockImplementation(async () => ({
      ok: false,
      status: 409,
      json: async () => ({ error: "This invoice was changed since you opened it.", conflict: true }),
    }));
    render(<InvoiceEditor initial={invoice} properties={[]} />);
    editTerms("Net 15");
    await flush();
    expect(screen.getByText(/changed since you opened it/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /reload/i })).toBeInTheDocument();
    editTerms("Net 10");
    await flush();
    expect(puts()).toHaveLength(1); // no further saves
  });

  it("saves right away (keepalive) if you leave before the debounced save fires", async () => {
    const { unmount } = render(<InvoiceEditor initial={invoice} properties={[]} />);
    editTerms("Net 7");
    unmount(); // e.g. clicked "← All invoices" within the 1s debounce
    expect(puts()).toHaveLength(1);
    expect(puts()[0]).toMatchObject({ keepalive: true, body: { terms: "Net 7", base_updated_at: LOADED } });
  });

  it("doesn't save on leave when nothing is pending", async () => {
    const { unmount } = render(<InvoiceEditor initial={invoice} properties={[]} />);
    unmount();
    expect(puts()).toHaveLength(0);
  });
});
