// @vitest-environment jsdom
import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

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
});
