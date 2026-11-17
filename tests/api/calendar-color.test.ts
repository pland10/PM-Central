import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({ prisma: {} }));
vi.mock("@/config/features", () => ({ isFeatureEnabled: vi.fn(() => true) }));
vi.mock("@/lib/auth/supabase-server", () => ({ getCurrentUser: vi.fn() }));
vi.mock("@/lib/staff", () => ({ listStaff: vi.fn(async () => [{ name: "Ari", email: "ari@pmi.com" }]) }));
vi.mock("@/lib/calendar/colors-db", () => ({ setUserColor: vi.fn() }));

import { getCurrentUser } from "@/lib/auth/supabase-server";
import { setUserColor } from "@/lib/calendar/colors-db";
import { CALENDAR_COLORS } from "@/lib/calendar/colors";
import { PUT } from "@/app/api/calendar/color/route";

const put = (body: unknown) =>
  PUT(new NextRequest("https://pmilighthouse.app/api/calendar/color", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }));
const BLUE = CALENDAR_COLORS[0].hex;

beforeEach(() => {
  vi.mocked(getCurrentUser).mockResolvedValue({ id: "u1", email: "paul@pmi.com", name: "Paul", role: "user" } as never);
  vi.mocked(setUserColor).mockResolvedValue({ ok: true });
});
afterEach(() => vi.clearAllMocks());

describe("PUT /api/calendar/color (my color)", () => {
  it("sets the signed-in person's own color", async () => {
    const res = await put({ color: BLUE });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, email: "paul@pmi.com", color: BLUE });
    expect(setUserColor).toHaveBeenCalledWith({}, "paul@pmi.com", BLUE);
  });

  it("409s with who has it when the color is taken", async () => {
    vi.mocked(setUserColor).mockResolvedValueOnce({ ok: false, takenBy: "ari@pmi.com" });
    const res = await put({ color: BLUE });
    expect(res.status).toBe(409);
    expect((await res.json()).error).toMatch(/Ari/);
  });

  it("only takes colors from the set, and needs a signed-in user", async () => {
    expect((await put({ color: "#ff0000" })).status).toBe(400);
    vi.mocked(getCurrentUser).mockResolvedValueOnce(null);
    expect((await put({ color: BLUE })).status).toBe(401);
    expect(setUserColor).not.toHaveBeenCalled();
  });
});
