// @vitest-environment jsdom
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SendReminders, type DelinquentLease } from "@/app/(app)/SendReminders";

const rows: DelinquentLease[] = [
  { key: "l1", tenant: "Jordan Lee", address: "12 Oak St", amount: 1200, email: "jordan@x.com", lastRemindedAt: null },
  { key: "l2", tenant: "Pat Kim", address: "3 Elm Ave", amount: 800, email: "pat@x.com", lastRemindedAt: "2026-11-01T12:00:00Z" },
  { key: "l3", tenant: "No Email", address: "9 Pine Rd", amount: 500, email: null, lastRemindedAt: null },
];

let fetchMock: ReturnType<typeof vi.fn>;
beforeEach(() => {
  fetchMock = vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ sent: 2, failed: [], skipped: 0 }) }));
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

const dialog = () => screen.getByRole("dialog", { name: /send rent reminders/i });

describe("SendReminders", () => {
  it("opens the picker, disables tenants with no email, and shows last-reminded", async () => {
    const user = userEvent.setup();
    render(<SendReminders delinquencies={rows} />);
    await user.click(screen.getByRole("button", { name: /send reminders/i }));

    expect(within(dialog()).getByText(/No email on file/i)).toBeTruthy();
    expect((within(dialog()).getByLabelText("select-l3") as HTMLInputElement).disabled).toBe(true);
    expect(within(dialog()).getByText(/Reminded Nov 1/i)).toBeTruthy();
  });

  it("select-all covers only tenants with an email", async () => {
    const user = userEvent.setup();
    render(<SendReminders delinquencies={rows} />);
    await user.click(screen.getByRole("button", { name: /send reminders/i }));
    await user.click(within(dialog()).getByLabelText("select-all"));

    expect((within(dialog()).getByLabelText("select-l1") as HTMLInputElement).checked).toBe(true);
    expect((within(dialog()).getByLabelText("select-l2") as HTMLInputElement).checked).toBe(true);
    expect((within(dialog()).getByLabelText("select-l3") as HTMLInputElement).checked).toBe(false);
  });

  it("sends only the selected lease ids and reports the result", async () => {
    const user = userEvent.setup();
    render(<SendReminders delinquencies={rows} />);
    await user.click(screen.getByRole("button", { name: /send reminders/i }));
    await user.click(within(dialog()).getByLabelText("select-l1"));
    await user.click(within(dialog()).getByRole("button", { name: /send 1 reminder/i }));

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("/api/reminders/send");
    expect(JSON.parse(init.body)).toEqual({ leaseIds: ["l1"] });
    expect(await within(dialog()).findByText(/Sent 2 reminders/i)).toBeTruthy();
  });

  it("won't send with nothing selected", async () => {
    const user = userEvent.setup();
    render(<SendReminders delinquencies={rows} />);
    await user.click(screen.getByRole("button", { name: /send reminders/i }));
    expect((within(dialog()).getByRole("button", { name: /send .*reminder/i }) as HTMLButtonElement).disabled).toBe(true);
  });
});
