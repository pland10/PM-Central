import { describe, it, expect } from "vitest";
import {
  parsePortfolioBalances,
  parsePayables,
  drawFigures,
  monthKeyET,
  prevMonthKey,
  isMonthKey,
  buildDrawRows,
  reserveLoweredBy,
  applyRecord,
  type DrawRecord,
} from "@/lib/owner-draws";

const row = (data: Record<string, unknown>, rowTypeID = 3) => ({ rowTypeID, data });

describe("parsePortfolioBalances", () => {
  it("reads balance, reserve, unpaid bills and owners; skips the totals row", () => {
    const out = parsePortfolioBalances([
      row({
        portfolioID: "75",
        portfolio: "Grant Holdings",
        contacts: JSON.stringify([
          { contactID: "1", percentOwned: "100.0000", name: "Ann Owner" },
          { contactID: "2", percentOwned: "0.0000", name: "Helper Contact" },
        ]),
        operatingBalance: "$2,683.33",
        cashBalance: "2683.33",
        totalReserveAmount: "500.00",
        reserveAmount: "500.00",
        accountsPayableBalance: "450.75",
        holdDistributions: "0",
      }),
      row({ operatingBalance: "99999" }, 4),
    ]);
    expect(out).toEqual([
      {
        portfolioId: "75",
        name: "Grant Holdings",
        owners: ["Ann Owner"],
        balance: 2683.33,
        reserve: 500,
        unpaid: 450.75,
        hold: false,
      },
    ]);
  });

  it("accepts the owners as an array and falls back to them for the name", () => {
    const [p] = parsePortfolioBalances([
      row({
        portfolioID: 9,
        contacts: [{ name: "Bo Lee", percentOwned: "50" }, { name: "Cy Lee", percentOwned: "50" }],
        operatingBalance: "0",
        totalReserveAmount: "0",
        accountsPayableBalance: "0",
        holdDistributions: true,
      }),
    ]);
    expect(p.portfolioId).toBe("9");
    expect(p.owners).toEqual(["Bo Lee", "Cy Lee"]);
    expect(p.name).toBe("Bo Lee & Cy Lee");
    expect(p.hold).toBe(true);
  });

  it("reads a portfolio name given as an object", () => {
    const [p] = parsePortfolioBalances([row({ portfolioID: "3", portfolio: { name: "Acme LLC" } })]);
    expect(p.name).toBe("Acme LLC");
  });

  it("uses the reserve when the total reserve is missing", () => {
    const [p] = parsePortfolioBalances([row({ portfolioID: "3", reserveAmount: "250" })]);
    expect(p.reserve).toBe(250);
  });
});

describe("parsePayables", () => {
  it("groups unpaid bill lines by portfolio, newest due first; skips voided lines", () => {
    const m = parsePayables([
      row({ portfolioID: "75", billID: "3000", description: "School notice", amountUnpaid: "$25.00", dateDue: "2026-11-14" }),
      row({ portfolioID: "75", billID: "3018", description: "Leak in the basement", amountUnpaid: "313.93", dateDue: "2026-11-19" }),
      row({ portfolioID: "9", billID: "1", description: "Pest Control", amountUnpaid: "30" }),
      row({ portfolioID: "9", billID: "2", description: "Paid already", amountUnpaid: "0" }),
      row({ portfolioID: "9", billID: "7", description: "Voided", amountUnpaid: "400", isVoided: "1" }),
      row({ portfolioID: "75", billID: "8", description: null, chargeAccountName: "Lease Renewal Fee", amountUnpaid: "195", dateDue: "2026-11-12" }),
      row({ amountUnpaid: "5" }), // no portfolio
      row({ portfolioID: "9", amountUnpaid: "1" }, 4),
    ]);
    expect(m.get("75")).toEqual([
      { billId: "3018", description: "Leak in the basement", amount: 313.93, dateDue: "2026-11-19" },
      { billId: "3000", description: "School notice", amount: 25, dateDue: "2026-11-14" },
      { billId: "8", description: "Lease Renewal Fee", amount: 195, dateDue: "2026-11-12" },
    ]);
    expect(m.get("9")).toEqual([{ billId: "1", description: "Pest Control", amount: 30, dateDue: "" }]);
    expect(m.size).toBe(2);
  });
});

describe("drawFigures", () => {
  const base = { balance: 5000, reserve: 500, unpaid: 420.5 };

  it("due to owner = balance − reserve − unpaid bills", () => {
    expect(drawFigures(base, {})).toEqual({
      balance: 5000,
      reserve: 500,
      unpaid: 420.5,
      due: 4079.5,
      edited: { balance: false, reserve: false, unpaid: false },
    });
  });

  it("an edited number replaces Rentvine's", () => {
    const f = drawFigures(base, { reserve: 250, unpaid: 2920.5 });
    expect(f.reserve).toBe(250);
    expect(f.unpaid).toBe(2920.5);
    expect(f.due).toBe(1829.5);
    expect(f.edited).toEqual({ balance: false, reserve: true, unpaid: true });
  });

  it("can go negative", () => {
    expect(drawFigures({ balance: 172.56, reserve: 500, unpaid: 250 }, {}).due).toBe(-577.44);
  });
});

describe("month keys", () => {
  it("uses the Eastern-time month", () => {
    expect(monthKeyET(new Date("2026-12-01T03:00:00Z"))).toBe("2026-11"); // still Nov 30 in NY
    expect(monthKeyET(new Date("2026-12-01T06:00:00Z"))).toBe("2026-12");
  });
  it("steps back a month across a year", () => {
    expect(prevMonthKey("2027-01")).toBe("2026-12");
    expect(prevMonthKey("2026-11")).toBe("2026-10");
  });
  it("validates", () => {
    expect(isMonthKey("2026-11")).toBe(true);
    expect(isMonthKey("2026-13")).toBe(false);
    expect(isMonthKey("26-11")).toBe(false);
  });
});

const rec = (r: Partial<DrawRecord>): DrawRecord => ({
  portfolioId: "75",
  balanceOverride: null,
  reserveOverride: null,
  unpaidOverride: null,
  note: "",
  approvedAt: null,
  approvedBy: null,
  paidAt: null,
  paidBy: null,
  snapshot: null,
  ...r,
});

describe("buildDrawRows", () => {
  const live = [
    { portfolioId: "75", name: "Grant", owners: ["Ann"], balance: 3000, reserve: 500, unpaid: 100, hold: false },
    { portfolioId: "9", name: "Empty", owners: [], balance: 0, reserve: 0, unpaid: 0, hold: false },
    { portfolioId: "4", name: "Able", owners: [], balance: 900, reserve: 500, unpaid: 0, hold: true },
  ];
  const bills = new Map([["75", [{ billId: "1", description: "Pest Control", amount: 100, dateDue: "" }]]]);

  it("current month: live figures, sorted by name, all-zero portfolios hidden", () => {
    const rows = buildDrawRows({ live, bills, records: [], previous: [] });
    expect(rows.map((r) => r.portfolioId)).toEqual(["4", "75"]);
    const g = rows[1];
    expect(g.figures.due).toBe(2400);
    expect(g.bills).toHaveLength(1);
    expect(g.frozen).toBe(false);
    expect(rows[0].hold).toBe(true);
  });

  it("keeps an all-zero portfolio that has a saved note", () => {
    const rows = buildDrawRows({ live, bills, records: [rec({ portfolioId: "9", note: "check" })], previous: [] });
    expect(rows.map((r) => r.portfolioId)).toContain("9");
  });

  it("applies the month's edits", () => {
    const rows = buildDrawRows({ live, bills, records: [rec({ reserveOverride: 250 })], previous: [] });
    const g = rows.find((r) => r.portfolioId === "75")!;
    expect(g.figures.reserve).toBe(250);
    expect(g.figures.due).toBe(2650);
  });

  it("an approved row shows the figures frozen at approval, not today's", () => {
    const snapshot = { name: "Grant", owners: ["Ann"], balance: 4000, reserve: 500, unpaid: 300, hold: false, bills: [] };
    const rows = buildDrawRows({
      live,
      bills,
      records: [rec({ approvedAt: "2026-11-05T14:00:00Z", approvedBy: "paul", snapshot })],
      previous: [],
    });
    const g = rows.find((r) => r.portfolioId === "75")!;
    expect(g.frozen).toBe(true);
    expect(g.figures.balance).toBe(4000);
    expect(g.figures.due).toBe(3200);
    expect(g.bills).toEqual([]);
  });

  it("a past month (no live data) lists only saved rows", () => {
    const snapshot = { name: "Grant", owners: [], balance: 4000, reserve: 500, unpaid: 300, hold: false, bills: [] };
    const rows = buildDrawRows({ live: null, bills: new Map(), records: [rec({ paidAt: "x", snapshot }), rec({ portfolioId: "9", note: "n" })], previous: [] });
    expect(rows.map((r) => r.portfolioId)).toEqual(["75"]);
  });

  it("carries last month's note and a lowered reserve onto this month's row", () => {
    const prevSnap = { name: "Grant", owners: [], balance: 1, reserve: 500, unpaid: 0, hold: false, bills: [] };
    const rows = buildDrawRows({
      live,
      bills,
      records: [],
      previous: [rec({ note: "Charge next month: fridge $890", reserveOverride: 250, snapshot: prevSnap })],
    });
    const g = rows.find((r) => r.portfolioId === "75")!;
    expect(g.lastNote).toBe("Charge next month: fridge $890");
    expect(g.lastReserveLoweredBy).toBe(250);
  });
});

describe("reserveLoweredBy", () => {
  it("compares the edit against the Rentvine reserve it replaced", () => {
    expect(reserveLoweredBy(rec({ reserveOverride: 250 }), 500)).toBe(250);
    expect(reserveLoweredBy(rec({ reserveOverride: 600 }), 500)).toBe(0);
    expect(reserveLoweredBy(rec({}), 500)).toBe(0);
  });
});

describe("applyRecord", () => {
  const live = [{ portfolioId: "75", name: "Grant", owners: ["Ann"], balance: 3000, reserve: 500, unpaid: 100, hold: false }];
  const base = () => buildDrawRows({ live, bills: new Map(), records: [], previous: [] })[0];

  it("applies a saved edit and note to the row on screen", () => {
    const row = applyRecord(base(), rec({ reserveOverride: 250, note: "half reserve" }));
    expect(row.figures.reserve).toBe(250);
    expect(row.figures.due).toBe(2650);
    expect(row.figures.edited.reserve).toBe(true);
    expect(row.note).toBe("half reserve");
    expect(row.frozen).toBe(false);
  });

  it("an approval brings the frozen figures", () => {
    const snapshot = { name: "Grant", owners: ["Ann"], balance: 3100, reserve: 500, unpaid: 100, hold: false, bills: [] };
    const row = applyRecord(base(), rec({ approvedAt: "2026-11-05T14:00:00Z", approvedBy: "Boss", snapshot }));
    expect(row.frozen).toBe(true);
    expect(row.approvedBy).toBe("Boss");
    expect(row.figures.due).toBe(2500);
    expect(row.rentvine.balance).toBe(3100);
  });
});
