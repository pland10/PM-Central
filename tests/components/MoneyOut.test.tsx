// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { MoneyOut } from "@/app/(app)/accounting/OverviewSections";
import type { MoneyOutResult } from "@/lib/accounting";

const ok: MoneyOutResult = {
  ok: true,
  count: 2,
  total: 4798.59,
  asOf: "Oct 30, 2026",
  rows: [
    { payoutId: "p2", date: "2026-08-20", payee: "Neil Maclean", payeeType: "Owner", method: "eCheck (ACH)", checkNumber: "", memo: "Owner Distribution", amount: 4484.3 },
    { payoutId: "p1", date: "2026-08-07", payee: "LIGHTHOUSE MAINTENANCE SERVICES LLC", payeeType: "Vendor", method: "Check", checkNumber: "31", memo: "", amount: 314.29 },
  ],
};

describe("MoneyOut", () => {
  it("shows the count, total, and each payment's payee and type", () => {
    render(<MoneyOut data={ok} />);
    expect(screen.getByText("2 payments")).toBeInTheDocument();
    expect(screen.getByText("$4,799")).toBeInTheDocument(); // formatCurrency rounds to whole dollars
    expect(screen.getByText("Neil Maclean")).toBeInTheDocument();
    expect(screen.getByText("(Owner)")).toBeInTheDocument();
    expect(screen.getByText("LIGHTHOUSE MAINTENANCE SERVICES LLC")).toBeInTheDocument();
    expect(screen.getByText("(Vendor)")).toBeInTheDocument();
  });

  it("shows an empty state when there are no payments", () => {
    render(<MoneyOut data={{ ok: true, count: 0, total: 0, asOf: "", rows: [] }} />);
    expect(screen.getByText(/no payments in the last 90 days/i)).toBeInTheDocument();
  });

  it("shows the error state", () => {
    render(<MoneyOut data={{ ok: false, status: 502, error: "boom" }} />);
    expect(screen.getByText(/couldn't load payments/i)).toBeInTheDocument();
  });
});
