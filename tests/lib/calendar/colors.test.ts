import { afterEach, describe, expect, it, vi } from "vitest";
import type { PrismaClient } from "@prisma/client";
import { routeQueries, sqlOf } from "../../helpers/sql";
import { CALENDAR_COLORS, isCalendarColor } from "@/lib/calendar/colors";
import { assignMissingColors, listUserColors, setUserColor } from "@/lib/calendar/colors-db";

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
      [/FROM calendar_user_colors WHERE color/, []],
      [/INSERT INTO calendar_user_colors/, [{ user_email: "paul@pmi.com" }]],
    ]);
    expect(await setUserColor(f.prisma, "Paul@PMI.com", BLUE)).toEqual({ ok: true });
    const ins = f.queryRaw.mock.calls.find((c) => /INSERT INTO calendar_user_colors/.test(sqlOf(c[0])))![0] as { values: unknown[] };
    expect(sqlOf(ins)).toMatch(/ON CONFLICT \(user_email\) DO UPDATE/);
    expect(ins.values).toEqual(expect.arrayContaining(["paul@pmi.com", BLUE]));
  });

  it("refuses a color someone else has (checked first, and if two people race for it)", async () => {
    const taken = fake([[/FROM calendar_user_colors WHERE color/, [{ user_email: "ari@pmi.com" }]]]);
    expect(await setUserColor(taken.prisma, "paul@pmi.com", BLUE)).toEqual({ ok: false, takenBy: "ari@pmi.com" });

    const race = Object.assign(new Error("duplicate key value violates unique constraint"), { code: "P2010", meta: { code: "23505" } });
    const raced = fake([
      [/FROM calendar_user_colors WHERE color/, []],
      [/INSERT INTO calendar_user_colors/, race],
    ]);
    expect(await setUserColor(raced.prisma, "paul@pmi.com", BLUE)).toEqual({ ok: false, takenBy: null });
  });
});

describe("assignMissingColors", () => {
  const C = CALENDAR_COLORS.map((c) => c.hex);

  it("gives each person without a color the next free one, in order, leaving existing ones alone", async () => {
    const f = fake([
      [/SELECT user_email, color FROM calendar_user_colors/, [{ user_email: "paul@pmi.com", color: C[0] }]],
      [/INSERT INTO calendar_user_colors/, [{ user_email: "x" }]],
    ]);
    const out = await assignMissingColors(f.prisma, ["Paul@pmi.com", "ari@pmi.com", "jasper@pmi.com", "ari@pmi.com"]);
    expect(out).toEqual({ "paul@pmi.com": C[0], "ari@pmi.com": C[1], "jasper@pmi.com": C[2] });
    const inserts = f.queryRaw.mock.calls.filter((c) => /INSERT INTO calendar_user_colors/.test(sqlOf(c[0]))).map((c) => (c[0] as { values: unknown[] }).values);
    expect(inserts).toEqual([["ari@pmi.com", C[1]], ["jasper@pmi.com", C[2]]]);
    expect(sqlOf(f.queryRaw.mock.calls.find((c) => /INSERT INTO calendar_user_colors/.test(sqlOf(c[0])))![0])).toMatch(/ON CONFLICT DO NOTHING/);
  });

  it("moves on to the next color if one was taken at the same moment", async () => {
    let n = 0;
    const f = fake([
      [/SELECT user_email, color FROM calendar_user_colors/, []],
    ]);
    vi.mocked(f.queryRaw).mockImplementation((async (q: unknown) => {
      const sql = sqlOf(q);
      if (/SELECT user_email, color/.test(sql)) return [];
      if (/INSERT INTO calendar_user_colors/.test(sql)) return n++ === 0 ? [] : [{ user_email: "ari@pmi.com" }]; // 1st try lost the race
      throw new Error(`unrouted ${sql}`);
    }) as never);
    expect(await assignMissingColors(f.prisma, ["ari@pmi.com"])).toEqual({ "ari@pmi.com": C[1] });
  });

  it("stops when the colors run out (the rest stay grey)", async () => {
    const taken = C.map((hex, i) => ({ user_email: `u${i}@pmi.com`, color: hex }));
    const f = fake([[/SELECT user_email, color FROM calendar_user_colors/, taken]]);
    const out = await assignMissingColors(f.prisma, ["late@pmi.com"]);
    expect(out["late@pmi.com"]).toBeUndefined();
    expect(f.queryRaw.mock.calls.some((c) => /INSERT/.test(sqlOf(c[0])))).toBe(false);
  });
});

describe("setUserColor — making room", () => {
  const C = CALENDAR_COLORS.map((c) => c.hex);

  it("moves someone with an automatic color to the next free one, then gives the chosen color", async () => {
    const f = fake([
      [/FROM calendar_user_colors WHERE color/, [{ user_email: "jasper@pmi.com", auto: true }]],
      [/SELECT color FROM calendar_user_colors/, [{ color: C[0] }, { color: C[4] }]],
      [/UPDATE calendar_user_colors SET color/, [{ user_email: "jasper@pmi.com" }]],
      [/INSERT INTO calendar_user_colors/, [{ user_email: "pam@pmi.com" }]],
    ]);
    expect(await setUserColor(f.prisma, "pam@pmi.com", C[4])).toEqual({ ok: true, moved: { email: "jasper@pmi.com", color: C[1] } });
    const sqls = f.queryRaw.mock.calls.map((c) => c[0] as { values: unknown[] });
    const move = sqls.find((q) => /UPDATE calendar_user_colors SET color/.test(sqlOf(q)))!;
    expect(move.values).toEqual(expect.arrayContaining([C[1], "jasper@pmi.com"]));
    expect(sqlOf(move)).toMatch(/AND auto/); // only moves it if it's still automatic
    const ins = sqls.find((q) => /INSERT INTO calendar_user_colors/.test(sqlOf(q)))!;
    expect(sqlOf(ins)).toMatch(/auto = false/);
  });

  it("won't take a color someone chose themselves", async () => {
    const f = fake([[/FROM calendar_user_colors WHERE color/, [{ user_email: "ari@pmi.com", auto: false }]]]);
    expect(await setUserColor(f.prisma, "pam@pmi.com", C[4])).toEqual({ ok: false, takenBy: "ari@pmi.com" });
  });
});

