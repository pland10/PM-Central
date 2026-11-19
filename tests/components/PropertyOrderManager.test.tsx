// @vitest-environment jsdom
import { render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PropertyOrderManager, type OrderItem } from "@/app/(app)/admin/property-order/PropertyOrderManager";

afterEach(() => vi.clearAllMocks());

const rentals: OrderItem[] = [
  { id: "r1", label: "1 Main St", address: "1 Main St, Town" },
  { id: "r2", label: "9 Oak Ave", address: "9 Oak Ave, Town" },
];
const squatter: OrderItem[] = [{ id: "s1", label: "5 Pine St", address: "5 Pine St, Town" }];

describe("PropertyOrderManager", () => {
  it("renders both groups with houses in the given order and a drag handle each", () => {
    render(<PropertyOrderManager initialRentals={rentals} initialSquatter={squatter} />);

    expect(screen.getByText("Rental Units")).toBeInTheDocument();
    expect(screen.getByText("Squatter Watch")).toBeInTheDocument();

    const lists = screen.getAllByRole("list");
    const rentalItems = within(lists[0]).getAllByRole("listitem");
    expect(rentalItems).toHaveLength(2);
    expect(within(rentalItems[0]).getByText("1 Main St")).toBeTruthy(); // order preserved
    expect(within(rentalItems[1]).getByText("9 Oak Ave")).toBeTruthy();

    expect(screen.getByLabelText("Drag to reorder 1 Main St")).toBeInTheDocument();
    expect(screen.getByLabelText("Drag to reorder 5 Pine St")).toBeInTheDocument();
  });
});
