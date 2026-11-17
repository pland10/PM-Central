import { afterEach, describe, expect, it, vi } from "vitest";
import type { PrismaClient } from "@prisma/client";
import { routeQueries, sqlOf } from "../../helpers/sql";
import { CALENDAR_COLORS, isCalendarColor } from "@/lib/calendar/colors";
import { listUserColors, setUserColor } from "@/lib/calendar/colors-db";

afterEach(() => vi.clearAllMocks());

describe("calendar colors", () => {
  it("is a set of distinct colors, with no red (red means overdue)", () => {
    const hexes = CALENDAR_COLORS.map((c) => c.hex.toLowerCase());
    expect(new Set(hexes).size).toBe(hexes.length);
    expect(new Set(CALENDAR_COLORS.map((c) => c.name)).size).toBe(CALENDAR_COLORS.length);
    expect(CALENDAR_COLORS.length).toBeGreaterThanOrEqual(10);
    expect(CALENDAR_COLORS.some((c) => /red/i.test(c.name))).toBe(false);
    expect(isCalendarColor(CALENDAR_COLORS[0].hex)).toBe(true);
    expect(isCalendarColor("#ff0000")).toBe(false);
  });
});

function fake(queries: [RegExp, unknown[] | Error][] = []) {
  const executeRaw = vi.fn().mockResolvedValue(1);
  const executeRawUnsafe = vi.fn().mockResolvedValue(0);
  const queryRaw = vi.fn(routeQueries(queries));
  return { prisma: { $executeRaw: executeRaw, $executeRawUnsafe: executeRawUnsafe, $queryRaw: queryRaw } as unknown as PrismaClient, executeRaw, executeRawUnsafe, queryRaw };
}
const BLUE = CALENDAR_COLORS[0].hex;

describe("colors storage", () => {
  it("creates a table with one color per person and no shared colors, and lists them", async () => {
    const f = fake([[/FROM calendar_user_colors/, [{ user_email: "ari@pmi.com", color: BLUE }]]]);
    expect(await listUserColors(f.prisma)).toEqual({ "ari@pmi.com": BLUE });
    const ddl = f.executeRawUnsafe.mock.calls.map((c) => c[0]).join("\n");
    expect(ddl).toMatch(/CREATE TABLE IF NOT EXISTS calendar_user_colors/);
    expect(ddl).toMatch(/user_email\s+TEXT PRIMARY KEY/);
    expect(ddl).toMatch(/color\s+TEXT NOT NULL UNIQUE/);
  });

  it("saves my color when it's free", async () => {
    const f = fake([
      [/SELECT user_email FROM calendar_user_colors WHERE color/, []],
      [/INSERT INTO calendar_user_colors/, [{ user_email: "paul@pmi.com" }]],
    ]);
    expect(await setUserColor(f.prisma, "Paul@PMI.com", BLUE)).toEqual({ ok: true });
    const ins = f.queryRaw.mock.calls.find((c) => /INSERT INTO calendar_user_colors/.test(sqlOf(c[0])))![0] as { values: unknown[] };
    expect(sqlOf(ins)).toMatch(/ON CONFLICT \(user_email\) DO UPDATE/);
    expect(ins.values).toEqual(expect.arrayContaining(["paul@pmi.com", BLUE]));
  });

  it("refuses a color someone else has (checked first, and if two people race for it)", async () => {
    const taken = fake([[/SELECT user_email FROM calendar_user_colors WHERE color/, [{ user_email: "ari@pmi.com" }]]]);
    expect(await setUserColor(taken.prisma, "paul@pmi.com", BLUE)).toEqual({ ok: false, takenBy: "ari@pmi.com" });

    const race = Object.assign(new Error("duplicate key value violates unique constraint"), { code: "P2010", meta: { code: "23505" } });
    const raced = fake([
      [/SELECT user_email FROM calendar_user_colors WHERE color/, []],
      [/INSERT INTO calendar_user_colors/, race],
    ]);
    expect(await setUserColor(raced.prisma, "paul@pmi.com", BLUE)).toEqual({ ok: false, takenBy: null });
  });
});
