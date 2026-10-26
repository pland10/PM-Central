// @vitest-environment jsdom
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { jsonResponse } from "../helpers/fetch";

import { PaymentsPane } from "@/app/(app)/PaymentsPane";
import type { PaymentAsOf, PaymentLine } from "@/lib/payments-dashboard";

const line = (over: Partial<PaymentLine>): PaymentLine => ({
  source_id: "rvpay_1",
  kind: "rent",
  tenant: "Bobbye Sanders",
  property_address: "1 Thornton St, Patchogue",
  amount: 800,
  date_posted: "2026-10-21",
  clear_date: null,
  expected_clear: null,
  ...over,
});

function data(over: Partial<PaymentAsOf>): PaymentAsOf {
  return {
    asOf: "2026-10-26",
    clearedCount: 0,
    clearedTotal: 0,
    clearedByOwner: [],
    rangeDays: 1,
    pendingCount: 0,
    pendingTotal: 0,
    pendingStale: 0,
    pending: [],
    returnedCount: 0,
    returnedTotal: 0,
    returned: [],
    ...over,
  };
}

describe("PaymentsPane", () => {
  it("labels an owner contribution so it isn't mistaken for rent", () => {
    const owner = line({
      source_id: "rvown_11347",
      kind: "owner",
      tenant: "Christian Chike",
      property_address: "13 Beaver Trail, Coram",
      amount: 2950,
    });
    render(<PaymentsPane initial={data({ pending: [line({}), owner], pendingCount: 2, pendingTotal: 3750 })} />);

    const ownerRow = screen.getByText("Christian Chike").closest("div.flex") as HTMLElement;
    expect(within(ownerRow).getByText(/owner contribution/i)).toBeTruthy();

    const rentRow = screen.getByText("Bobbye Sanders").closest("div.flex") as HTMLElement;
    expect(within(rentRow).queryByText(/owner contribution/i)).toBeNull();
  });
  it("switches to a 7-day look-back and shows when each payment cleared", async () => {
    const week = data({
      rangeDays: 7,
      clearedCount: 1,
      clearedTotal: 2950,
      clearedByOwner: [
        {
          owner: "Christian Chike",
          total: 2950,
          lines: [line({ source_id: "rvown_11347", kind: "owner", tenant: "Christian Chike", amount: 2950, clear_date: "2026-10-24" })],
        },
      ],
    });
    const fetchMock = vi.fn(async (_url: string) => jsonResponse(week));
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    render(<PaymentsPane initial={data({})} />);

    expect(screen.getByRole("button", { name: "1 day" }).getAttribute("aria-pressed")).toBe("true");
    await user.click(screen.getByRole("button", { name: "7 days" }));

    expect(fetchMock.mock.calls[0][0]).toContain("days=7");
    expect(await screen.findByText(/cleared — last 7 days/i)).toBeTruthy();
    expect(screen.getByText(/cleared oct 24/i)).toBeTruthy();
    expect(screen.getByRole("button", { name: "7 days" }).getAttribute("aria-pressed")).toBe("true");
  });
});
