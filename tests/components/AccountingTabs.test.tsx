// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AccountingTabs } from "@/app/(app)/accounting/AccountingTabs";

let pathname = "/accounting";
vi.mock("next/navigation", () => ({ usePathname: () => pathname }));

afterEach(() => {
  pathname = "/accounting";
  vi.clearAllMocks();
});

describe("AccountingTabs", () => {
  it("lists Bank Transactions first (the default) then Rentvine Transactions", () => {
    render(<AccountingTabs />);
    const links = screen.getAllByRole("link");
    expect(links.map((l) => l.textContent)).toEqual(["Bank Transactions", "Rentvine Transactions"]);
    expect(links[0]).toHaveAttribute("href", "/accounting");
    expect(links[1]).toHaveAttribute("href", "/accounting/rentvine");
  });

  it("marks Bank active on /accounting (the default landing tab)", () => {
    pathname = "/accounting";
    render(<AccountingTabs />);
    const bank = screen.getByRole("link", { name: "Bank Transactions" });
    expect(bank.className).toContain("border-brand-500");
  });

  it("marks Rentvine active on /accounting/rentvine", () => {
    pathname = "/accounting/rentvine";
    render(<AccountingTabs />);
    const rentvine = screen.getByRole("link", { name: "Rentvine Transactions" });
    expect(rentvine.className).toContain("border-brand-500");
  });
});
