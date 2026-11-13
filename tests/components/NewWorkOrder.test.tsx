// @vitest-environment jsdom
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NewWorkOrder } from "@/app/(app)/maintenance/NewWorkOrder";

const choices = [
  { label: "8204 138th Street · Jamaica", propertyId: "pmilighthouse:property:48", unitId: null },
  { label: "8204 138th Street · Jamaica — Unit 2", propertyId: "pmilighthouse:property:48", unitId: "46" },
];
let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  fetchMock = vi.fn(async () => ({
    ok: true,
    json: async () => ({ ok: true, number: "100412", url: "https://pmilighthouse.rentvine.com/maintenance/work-orders/412" }),
  }));
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe("NewWorkOrder", () => {
  it("creates a work order in Rentvine for the picked unit and shows its number", async () => {
    const user = userEvent.setup();
    render(<NewWorkOrder choices={choices} />);
    await user.click(screen.getByRole("button", { name: "+ New work order" }));
    await user.type(screen.getByPlaceholderText(/Start typing an address/), "8204 138th Street · Jamaica — Unit 2");
    await user.type(screen.getByPlaceholderText(/Kitchen sink/), "No heat");
    await user.click(screen.getByRole("button", { name: "Create in Rentvine" }));

    expect(fetchMock.mock.calls[0][0]).toBe("/api/work-orders/create");
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({
      propertyId: "pmilighthouse:property:48",
      unitId: "46",
      description: "No heat",
      priority: "Medium",
    });
    expect(await screen.findByText(/Created WO #100412 in Rentvine/)).toBeTruthy();
    expect(screen.getByRole("link", { name: "Open it" }).getAttribute("href")).toBe(
      "https://pmilighthouse.rentvine.com/maintenance/work-orders/412"
    );
  });

  it("insists on a property from the list and a description", async () => {
    const user = userEvent.setup();
    render(<NewWorkOrder choices={choices} />);
    await user.click(screen.getByRole("button", { name: "+ New work order" }));
    await user.type(screen.getByPlaceholderText(/Start typing an address/), "Somewhere else");
    await user.click(screen.getByRole("button", { name: "Create in Rentvine" }));
    expect(screen.getByText("Pick a property from the list.")).toBeTruthy();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("property box is a short searchable list, picked with the keyboard", async () => {
    const user = userEvent.setup();
    const many = Array.from({ length: 30 }, (_, i) => ({ label: `${i + 1} Main St · Town`, propertyId: `p${i}`, unitId: null }));
    render(<NewWorkOrder choices={[...many, ...choices]} />);
    await user.click(screen.getByRole("button", { name: "+ New work order" }));
    const box = screen.getByRole("combobox", { name: "Property" });
    await user.type(box, "1");
    expect(within(screen.getByRole("listbox", { name: "Property" })).getAllByRole("option")).toHaveLength(8);
    expect(screen.getByText(/more — keep typing/)).toBeTruthy();
    await user.clear(box);
    await user.type(box, "jamaica 2{Enter}");
    expect(box).toHaveValue("8204 138th Street · Jamaica — Unit 2");
    await user.type(screen.getByPlaceholderText(/Kitchen sink/), "No heat");
    await user.click(screen.getByRole("button", { name: "Create in Rentvine" }));
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toMatchObject({ propertyId: "pmilighthouse:property:48", unitId: "46" });
  });

  it("clicking a suggestion picks it without closing the popup", async () => {
    const user = userEvent.setup();
    render(<NewWorkOrder choices={choices} />);
    await user.click(screen.getByRole("button", { name: "+ New work order" }));
    await user.type(screen.getByRole("combobox", { name: "Property" }), "unit");
    await user.click(screen.getByRole("option", { name: "8204 138th Street · Jamaica — Unit 2" }));
    expect(screen.getByRole("dialog", { name: "New work order" })).toBeTruthy();
    expect(screen.getByRole("combobox", { name: "Property" })).toHaveValue("8204 138th Street · Jamaica — Unit 2");
  });
});
