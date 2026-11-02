// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { WorkOrderNotes } from "@/app/(app)/work-orders/WorkOrderNotes";

const ok = (body: unknown, status = 200) => ({ ok: status < 400, status, json: async () => body });
let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
    if (init?.method === "POST") {
      const b = JSON.parse(String(init.body));
      return ok({ note: { id: 8, body: b.body, authorName: "Paul Landman", authorEmail: "paul@pmi.com", createdAt: "2026-11-02T15:00:00.000Z", emailedTo: b.emailTo ?? null }, emailed: Boolean(b.emailTo) }, 201);
    }
    return ok({
      notes: [{ id: 7, body: "Called the vendor", authorName: "Paul Landman", authorEmail: "paul@pmi.com", createdAt: "2026-11-01T14:00:00.000Z", emailedTo: null }],
      staff: [
        { name: "Jasper Jed Belen", email: "jasper@pmi.com" },
        { name: "Paul Landman", email: "paul@pmi.com" },
      ],
      assigneeEmail: "jasper@pmi.com",
    });
  });
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

const wo = { id: "abc", number: "100480", issue: "Garage door wire broke" };
const posts = () => fetchMock.mock.calls.filter((c) => c[1]?.method === "POST").map((c) => JSON.parse(String(c[1].body)));

describe("WorkOrderNotes", () => {
  it("shows the existing notes with who wrote them", async () => {
    render(<WorkOrderNotes wo={wo} onClose={() => {}} />);
    expect(await screen.findByText("Called the vendor")).toBeTruthy();
    expect(screen.getByText(/Paul Landman ·/)).toBeTruthy();
  });

  it("Add note saves without emailing", async () => {
    const onAdded = vi.fn();
    const user = userEvent.setup();
    render(<WorkOrderNotes wo={wo} onClose={() => {}} onAdded={onAdded} />);
    await screen.findByText("Called the vendor");
    await user.type(screen.getByLabelText(/new note/i), "Owner approved");
    await user.click(screen.getByRole("button", { name: /^add note$/i }));
    expect(posts()).toEqual([{ woId: "abc", body: "Owner approved" }]);
    expect(await screen.findByText("Owner approved")).toBeTruthy();
    expect(onAdded).toHaveBeenCalled();
  });

  it("Add note & email sends to the chosen person, defaulting to the assignee", async () => {
    const user = userEvent.setup();
    render(<WorkOrderNotes wo={wo} onClose={() => {}} />);
    await screen.findByText("Called the vendor");
    expect((screen.getByLabelText(/email to/i) as HTMLSelectElement).value).toBe("jasper@pmi.com");
    await user.type(screen.getByLabelText(/new note/i), "Please call the vendor");
    await user.click(screen.getByRole("button", { name: /add note & email/i }));
    expect(posts()).toEqual([{ woId: "abc", body: "Please call the vendor", emailTo: "jasper@pmi.com" }]);
    expect(await screen.findByText(/note added and emailed jasper@pmi.com/i)).toBeTruthy();
    expect(screen.getByText(/· emailed jasper@pmi.com/)).toBeTruthy(); // recorded on the note
  });

  it("won't add an empty note", async () => {
    render(<WorkOrderNotes wo={wo} onClose={() => {}} />);
    await screen.findByText("Called the vendor");
    expect((screen.getByRole("button", { name: /^add note$/i }) as HTMLButtonElement).disabled).toBe(true);
  });
});
