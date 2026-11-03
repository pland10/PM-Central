// Inspector receipts (money OUT: proof a Squatter Watch inspector was paid for
// the visits listed). Pure helpers shared by the API, pages and tests. Ported
// from the standalone invoicing app.

export type ReceiptItem = { property: string; at: string; amount: number | string };

const num = (v: unknown): number => {
  const n = typeof v === "number" ? v : parseFloat(String(v ?? "").replace(/[$,]/g, ""));
  return Number.isFinite(n) ? n : 0;
};

export function receiptTotal(items: ReceiptItem[] | null | undefined): number {
  return Math.round((items ?? []).reduce((s, it) => s + num(it.amount), 0) * 100) / 100;
}

export function nextReceiptNumber(prefix: string, existing: string[]): string {
  let max = 0;
  const re = new RegExp(`^${prefix}(\\d+)$`);
  for (const n of existing) {
    const m = re.exec(n);
    if (m) max = Math.max(max, Number(m[1]));
  }
  return prefix + String(max + 1).padStart(4, "0");
}

export type ReceiptInput = {
  inspector: string;
  paidOn: string;
  method: string | null;
  reference: string | null;
  notes: string | null;
  items: { property: string; at: string; amount: number }[];
};

const text = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);

export function parseReceiptInput(body: unknown): { ok: true; data: ReceiptInput } | { ok: false; error: string } {
  const b = (body && typeof body === "object" ? body : {}) as Record<string, unknown>;
  const paidOn = String(b.paidOn ?? "");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(paidOn)) return { ok: false, error: "Paid date must be YYYY-MM-DD." };
  const rawItems = Array.isArray(b.items) ? (b.items as Record<string, unknown>[]) : [];
  const items: ReceiptInput["items"] = [];
  for (const it of rawItems) {
    const property = text(it?.property) ?? "";
    const at = text(it?.at) ?? "";
    const rawAmt = String(it?.amount ?? "").trim();
    if (!property && !at && !rawAmt) continue; // empty line
    const amount = rawAmt === "" ? 0 : parseFloat(rawAmt.replace(/[$,]/g, ""));
    if (!Number.isFinite(amount) || amount < 0) return { ok: false, error: `Amount "${rawAmt}" isn't a number.` };
    items.push({ property, at, amount: Math.round(amount * 100) / 100 });
  }
  return {
    ok: true,
    data: {
      inspector: text(b.inspector) ?? "",
      paidOn,
      method: text(b.method),
      reference: text(b.reference),
      notes: text(b.notes),
      items,
    },
  };
}
