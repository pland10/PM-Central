// Owner Draws (Accounting → Owner Draws): each month, what every owner gets paid
// out of their Rentvine portfolio. Replaces the monthly "Owner Draws"
// spreadsheet. Pure logic here (client-safe); the Rentvine loader is
// ./owner-draws-rentvine.ts and storage ./owner-draws-db.ts.
//
//   Due to owner = portfolio balance − reserve − unpaid bills
//
// The three numbers come live from Rentvine's "Portfolio Balances" report
// (operatingBalance, totalReserveAmount, accountsPayableBalance; Rentvine's own
// distributableAmount is the same formula). Any of them can be edited for the
// month (e.g. hold back a bill that hasn't arrived, or take a smaller reserve
// this month); an edit only changes that month. A lowered reserve is picked up
// again on its own next month, because next month starts from Rentvine's full
// reserve and the money left behind is still in the balance.
//
// Once a row is approved (or marked paid) its Rentvine figures are frozen in a
// snapshot, so paying the owner — which drops the live balance — never changes
// the approved amount.

export type ReportRow = { rowTypeID?: number; data?: Record<string, unknown> };

export type DrawBill = { billId: string; description: string; amount: number; dateDue: string };

export type DrawPortfolio = {
  portfolioId: string;
  name: string;
  owners: string[];
  balance: number;
  reserve: number;
  unpaid: number;
  hold: boolean; // Rentvine "Hold Distributions"
};

// The Rentvine side of a row, frozen at approval.
export type DrawSnapshot = Omit<DrawPortfolio, "portfolioId"> & { bills: DrawBill[] };

export type DrawOverrides = { balance?: number | null; reserve?: number | null; unpaid?: number | null };

export type DrawRecord = {
  portfolioId: string;
  balanceOverride: number | null;
  reserveOverride: number | null;
  unpaidOverride: number | null;
  note: string;
  approvedAt: string | null;
  approvedBy: string | null;
  paidAt: string | null;
  paidBy: string | null;
  snapshot: DrawSnapshot | null;
};

export type DrawFigures = {
  balance: number;
  reserve: number;
  unpaid: number;
  due: number;
  edited: { balance: boolean; reserve: boolean; unpaid: boolean };
};

export type DrawRow = {
  portfolioId: string;
  name: string;
  owners: string[];
  hold: boolean;
  rentvine: { balance: number; reserve: number; unpaid: number }; // before edits
  figures: DrawFigures;
  bills: DrawBill[];
  note: string;
  approvedAt: string | null;
  approvedBy: string | null;
  paidAt: string | null;
  paidBy: string | null;
  frozen: boolean; // figures come from the approval snapshot
  lastNote: string; // last month's note ("Charge next month: …")
  lastReserveLoweredBy: number; // reserve held back last month
};

export const round2 = (n: number) => Math.round(n * 100) / 100;

export function money(v: unknown): number {
  if (v == null || v === "") return 0;
  const n = Number(String(v).replace(/[^0-9.-]/g, ""));
  return Number.isFinite(n) ? n : 0;
}

const str = (v: unknown): string => (v == null ? "" : String(v).trim());
const truthy = (v: unknown) => v === true || v === 1 || v === "1" || v === "true";

function ownerNames(v: unknown): string[] {
  let list: unknown = v;
  if (typeof v === "string") {
    try {
      list = JSON.parse(v);
    } catch {
      return [];
    }
  }
  if (!Array.isArray(list)) return [];
  const people = list
    .map((o) => (o && typeof o === "object" ? (o as Record<string, unknown>) : {}))
    .map((o) => ({ name: str(o.name), share: money(o.percentOwned) }))
    .filter((o) => o.name);
  const owning = people.filter((o) => o.share > 0);
  return (owning.length ? owning : people).map((o) => o.name);
}

function portfolioName(d: Record<string, unknown>, owners: string[]): string {
  const p = d.portfolioName ?? d.portfolio;
  if (p && typeof p === "object") {
    const n = str((p as Record<string, unknown>).name);
    if (n) return n;
  } else if (str(p)) return str(p);
  return owners.join(" & ") || `Portfolio ${str(d.portfolioID)}`;
}

// Rentvine "Portfolio Balances" report rows → one entry per portfolio.
export function parsePortfolioBalances(rows: ReportRow[]): DrawPortfolio[] {
  const out: DrawPortfolio[] = [];
  for (const r of rows) {
    if (r?.rowTypeID !== 3 || !r.data) continue; // 3 = data, 4 = totals
    const d = r.data;
    const portfolioId = str(d.portfolioID);
    if (!portfolioId) continue;
    const owners = ownerNames(d.contacts ?? d.portfolioOwnersJson);
    out.push({
      portfolioId,
      name: portfolioName(d, owners),
      owners,
      balance: round2(money(d.operatingBalance)),
      reserve: round2(money(d.totalReserveAmount ?? d.reserveAmount)),
      unpaid: round2(money(d.accountsPayableBalance)),
      hold: truthy(d.holdDistributions),
    });
  }
  return out;
}

// Rentvine "Payables" report rows (unpaid bill lines) → bills by portfolio,
// latest due date first. Over the API the report also returns voided lines
// (the web UI hides them); without them the lines add up exactly to each
// portfolio's accountsPayableBalance (verified on all 58 portfolios, Nov 2026).
export function parsePayables(rows: ReportRow[]): Map<string, DrawBill[]> {
  const out = new Map<string, DrawBill[]>();
  for (const r of rows) {
    if (r?.rowTypeID !== 3 || !r.data) continue;
    const d = r.data;
    if (truthy(d.isVoided)) continue;
    const id = str(d.portfolioID);
    const amount = round2(money(d.amountUnpaid));
    if (!id || amount === 0) continue;
    const list = out.get(id) ?? [];
    list.push({
      billId: str(d.billID),
      description: str(d.description) || str(d.chargeAccountName) || "Bill",
      amount,
      dateDue: str(d.dateDue).slice(0, 10),
    });
    out.set(id, list);
  }
  for (const list of out.values()) list.sort((a, b) => b.dateDue.localeCompare(a.dateDue));
  return out;
}

export function drawFigures(base: { balance: number; reserve: number; unpaid: number }, o: DrawOverrides): DrawFigures {
  const pick = (edit: number | null | undefined, live: number) => (edit == null ? live : edit);
  const balance = pick(o.balance, base.balance);
  const reserve = pick(o.reserve, base.reserve);
  const unpaid = pick(o.unpaid, base.unpaid);
  return {
    balance,
    reserve,
    unpaid,
    due: round2(balance - reserve - unpaid),
    edited: { balance: o.balance != null, reserve: o.reserve != null, unpaid: o.unpaid != null },
  };
}

// ---- months ("YYYY-MM", Eastern time) ----

export function isMonthKey(v: unknown): v is string {
  return typeof v === "string" && /^\d{4}-(0[1-9]|1[0-2])$/.test(v);
}

export function monthKeyET(d: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York", year: "numeric", month: "2-digit" }).formatToParts(d);
  const y = parts.find((p) => p.type === "year")?.value;
  const m = parts.find((p) => p.type === "month")?.value;
  return `${y}-${m}`;
}

export function prevMonthKey(month: string): string {
  const [y, m] = month.split("-").map(Number);
  return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, "0")}`;
}

export function monthLabel(month: string): string {
  const [y, m] = month.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, 15)).toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "UTC" });
}

// ---- rows ----

// How much of the reserve was held back in a month (0 when it wasn't lowered).
export function reserveLoweredBy(r: DrawRecord, rentvineReserve: number): number {
  if (r.reserveOverride == null) return 0;
  return Math.max(0, round2(rentvineReserve - r.reserveOverride));
}

const overridesOf = (r: DrawRecord | undefined): DrawOverrides =>
  r ? { balance: r.balanceOverride, reserve: r.reserveOverride, unpaid: r.unpaidOverride } : {};

const hasContent = (r: DrawRecord) =>
  !!r.note.trim() ||
  r.balanceOverride != null ||
  r.reserveOverride != null ||
  r.unpaidOverride != null ||
  !!r.approvedAt ||
  !!r.paidAt;

// The month's rows. `live` is null for a past month (Rentvine only knows
// today's balances), so only rows saved that month are listed — from their
// snapshots. `previous` is last month's saved rows, for the carried note and
// the reserve that was held back.
export function buildDrawRows(args: {
  live: DrawPortfolio[] | null;
  bills: Map<string, DrawBill[]>;
  records: DrawRecord[];
  previous: DrawRecord[];
}): DrawRow[] {
  const recById = new Map(args.records.map((r) => [r.portfolioId, r]));
  const prevById = new Map(args.previous.map((r) => [r.portfolioId, r]));
  const liveById = new Map((args.live ?? []).map((p) => [p.portfolioId, p]));

  const ids = new Set<string>();
  for (const p of args.live ?? []) {
    const r = recById.get(p.portfolioId);
    if (p.balance !== 0 || p.reserve !== 0 || p.unpaid !== 0 || (r && hasContent(r))) ids.add(p.portfolioId);
  }
  for (const r of args.records) if (r.snapshot && (r.approvedAt || r.paidAt || !args.live)) ids.add(r.portfolioId);

  const rows: DrawRow[] = [];
  for (const id of ids) {
    const rec = recById.get(id);
    const live = liveById.get(id);
    const frozen = !!rec?.snapshot && (!!rec.approvedAt || !!rec.paidAt || !args.live);
    const src: DrawSnapshot | null = frozen
      ? rec!.snapshot
      : live
        ? { ...live, bills: args.bills.get(id) ?? [] }
        : null;
    if (!src) continue;
    const prev = prevById.get(id);
    rows.push({
      portfolioId: id,
      name: src.name,
      owners: src.owners,
      hold: src.hold,
      rentvine: { balance: src.balance, reserve: src.reserve, unpaid: src.unpaid },
      figures: drawFigures(src, overridesOf(rec)),
      bills: src.bills,
      note: rec?.note ?? "",
      approvedAt: rec?.approvedAt ?? null,
      approvedBy: rec?.approvedBy ?? null,
      paidAt: rec?.paidAt ?? null,
      paidBy: rec?.paidBy ?? null,
      frozen,
      lastNote: prev?.note.trim() ?? "",
      lastReserveLoweredBy: prev ? reserveLoweredBy(prev, prev.snapshot?.reserve ?? live?.reserve ?? 0) : 0,
    });
  }
  rows.sort((a, b) => a.name.localeCompare(b.name, "en", { sensitivity: "base" }));
  return rows;
}

// The row on screen after a save: the server's record applied over it. A
// record with a snapshot brings its frozen figures; without one the row keeps
// the Rentvine numbers it already had.
export function applyRecord(row: DrawRow, rec: DrawRecord): DrawRow {
  const frozen = !!rec.snapshot && (!!rec.approvedAt || !!rec.paidAt);
  const src = frozen ? rec.snapshot! : { ...row.rentvine, bills: row.bills, name: row.name, owners: row.owners, hold: row.hold };
  return {
    ...row,
    name: src.name,
    owners: src.owners,
    hold: src.hold,
    rentvine: { balance: src.balance, reserve: src.reserve, unpaid: src.unpaid },
    figures: drawFigures(src, overridesOf(rec)),
    bills: src.bills,
    note: rec.note,
    approvedAt: rec.approvedAt,
    approvedBy: rec.approvedBy,
    paidAt: rec.paidAt,
    paidBy: rec.paidBy,
    frozen,
  };
}
