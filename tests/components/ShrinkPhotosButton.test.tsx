// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ShrinkPhotosButton } from "@/app/(app)/admin/data/ShrinkPhotosButton";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("ShrinkPhotosButton", () => {
  it("works through every batch, then reports the total saved", async () => {
    const pages = [
      { checked: 12, shrunk: 10, savedBytes: 30_000_000, next: 12, remaining: 5 },
      { checked: 5, shrunk: 4, savedBytes: 12_500_000, next: null, remaining: 0 },
    ];
    const fetchMock = vi.fn(async (_url: string, _init: RequestInit) => ({ ok: true, json: async () => pages.shift() }));
    vi.stubGlobal("fetch", fetchMock);

    render(<ShrinkPhotosButton />);
    await userEvent.setup().click(screen.getByRole("button", { name: "Shrink photos" }));

    expect(await screen.findByText(/Done ✓ — checked 17, shrunk 14, saved 42\.5 MB/)).toBeTruthy();
    expect(JSON.parse(String(fetchMock.mock.calls[0][1].body))).toEqual({ after: 0 });
    expect(JSON.parse(String(fetchMock.mock.calls[1][1].body))).toEqual({ after: 12 });
  });
});
