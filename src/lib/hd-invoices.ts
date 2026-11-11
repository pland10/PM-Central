// Home Depot Pro invoices → Bank Transactions. The Home Depot Pro Xtra card
// (Citi) isn't reachable through Plaid, so its charges come in from the Pro
// site's "Invoices by Statement Date" export instead (an Import button on the
// Accounting page, and later a daily automated download). Pure parsing here so
// it's unit-tested directly.
//
// Export format (Nov 2026):
//   Invoices by Statement Date
//   Invoice Date,Invoice Number,Purchase Order,Amount Due
//   Nov 07 2026,5533628,,$20.62
//   Nov 07 2026,5134066,NA,$-6.51        <- a return / credit
//   Nov 04 2026,8513573,FHOUSE,$27.06    <- PO = the job name typed at checkout

export type HdInvoice = {
  invoiceNumber: string;
  date: string; // YYYY-MM-DD
  po: string; // job name / purchase order, "" when none
  amount: number; // positive = charge, negative = return (Plaid's sign convention)
};

export const HD_ACCOUNT_NAME = "Home Depot Pro";

// One stable row per invoice in plaid_transactions, so a re-import (or an
// overlapping download) updates instead of duplicating.
export const hdTransactionId = (invoiceNumber: string) => `hd:${invoiceNumber}`;

const MONTHS: Record<string, string> = {
  jan: "01", feb: "02", mar: "03", apr: "04", may: "05", jun: "06",
  jul: "07", aug: "08", sep: "09", oct: "10", nov: "11", dec: "12",
};

// "Nov 07 2026" → "2026-11-07"; also accepts 11/07/2026 and 2026-11-07.
function parseDate(s: string): string | null {
  const t = s.trim();
  let m = /^([A-Za-z]{3})[a-z]*\.?\s+(\d{1,2}),?\s+(\d{4})$/.exec(t);
  if (m && MONTHS[m[1].toLowerCase()]) return `${m[3]}-${MONTHS[m[1].toLowerCase()]}-${m[2].padStart(2, "0")}`;
  m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(t);
  if (m) return `${m[3]}-${m[1].padStart(2, "0")}-${m[2].padStart(2, "0")}`;
  if (/^\d{4}-\d{2}-\d{2}$/.test(t)) return t;
  return null;
}

// "$1,234.50" / "$-6.51" / "-$6.51" / "(6.51)" → number.
function parseMoney(s: string): number | null {
  const t = s.trim();
  if (!t) return null;
  const neg = t.includes("-") || /^\(.*\)$/.test(t);
  const n = Number(t.replace(/[^0-9.]/g, ""));
  if (!Number.isFinite(n) || !/\d/.test(t)) return null;
  return Math.round((neg ? -n : n) * 100) / 100;
}

// Minimal RFC-4180 line split (quotes, escaped quotes, commas inside quotes).
function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let q = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (q) {
      if (c === '"' && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else if (c === '"') q = false;
      else cur += c;
    } else if (c === '"') q = true;
    else if (c === ",") {
      out.push(cur);
      cur = "";
    } else cur += c;
  }
  out.push(cur);
  return out.map((v) => v.trim());
}

export function parseHdInvoicesCsv(text: string): { rows: HdInvoice[]; errors: string[] } {
  const lines = text.replace(/^﻿/, "").split(/\r?\n/);
  const headerAt = lines.findIndex((l) => /invoice\s*number/i.test(l) && /amount/i.test(l));
  if (headerAt === -1) {
    throw new Error("This doesn't look like a Home Depot Pro invoice export (no Invoice Number / Amount columns).");
  }
  const header = splitCsvLine(lines[headerAt]).map((h) => h.toLowerCase());
  const col = (re: RegExp) => header.findIndex((h) => re.test(h));
  const iDate = col(/date/);
  const iNum = col(/invoice\s*number/);
  const iPo = col(/purchase\s*order|^po$/);
  const iAmt = col(/amount/);

  const rows: HdInvoice[] = [];
  const errors: string[] = [];
  for (let n = headerAt + 1; n < lines.length; n++) {
    if (!lines[n].trim()) continue;
    const f = splitCsvLine(lines[n]);
    const invoiceNumber = (f[iNum] ?? "").trim();
    const date = parseDate(f[iDate] ?? "");
    const amount = parseMoney(f[iAmt] ?? "");
    if (!invoiceNumber || !date || amount === null) {
      errors.push(`Line ${n + 1}: couldn't read "${lines[n].trim()}"`);
      continue;
    }
    const rawPo = iPo >= 0 ? (f[iPo] ?? "").trim() : "";
    rows.push({ invoiceNumber, date, po: /^n\/?a$/i.test(rawPo) ? "" : rawPo, amount });
  }
  return { rows, errors };
}
