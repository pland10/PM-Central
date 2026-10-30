// @vitest-environment jsdom
import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Reimbursables } from "@/app/(app)/accounting/OverviewSections";

const reimb = {
  ok: true as const,
  asOf: "2026-10-30",
  outstanding: 7154,
  totalCharges: 84411,
  totalPayments: 77257,
  rows: [
    { date: "2026-10-27", description: "Bill period: 8/24 - 9/23", charges: 263, payments: 0, reference: "", property: "" },
    { date: "2026-10-23", description: "Ceiling Leak Repair", charges: 0, payments: 3000, reference: "PMI-0026", property: "" },
  ],
};

describe("Accounting overview — Reimbursables on a phone", () => {
  it("shows one Amount column on phones (reimbursements as +green) and Charged/Reimbursed from sm up", () => {
    render(<Reimbursables reimb={reimb} />);
    const table = screen.getByRole("table");

    const amount = within(table).getByRole("columnheader", { name: /^amount$/i });
    expect(amount.className).toMatch(/\bsm:hidden\b/);
    for (const name of [/^charged$/i, /^reimbursed$/i]) {
      const th = within(table).getByRole("columnheader", { name });
      expect(th.className).toMatch(/\bhidden\b/);
      expect(th.className).toMatch(/\bsm:table-cell\b/);
    }

    const [charge, payment] = within(table).getAllByRole("row").slice(1);
    expect(within(charge).getByText("$263", { selector: ".sm\\:hidden *, .sm\\:hidden" })).toBeTruthy();
    const plus = within(payment).getByText("+$3,000");
    expect(plus.className).toMatch(/text-emerald-700/);
  });

  it("scrolls sideways instead of cutting columns off if it's still too wide", () => {
    render(<Reimbursables reimb={reimb} />);
    expect(screen.getByRole("table").parentElement!.className).toMatch(/\boverflow-x-auto\b/);
  });
});
