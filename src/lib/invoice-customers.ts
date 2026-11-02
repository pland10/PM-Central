import { BILLING_PARTIES } from "@/config/invoicing-parties";
import { FREQUENCIES } from "@/lib/billing";

// Validate + normalize a customer from the Customers form (create or edit).
export type CustomerInput = {
  billingParty: string;
  name: string;
  addr: string | null;
  contact: string | null;
  attn: string | null;
  service: string | null;
  rate: number;
  frequency: string;
  startDate: string;
  isActive: boolean;
  rentvinePortfolioId: string | null;
  rentvineContactId: string | null;
  notes: string | null;
};

const text = (v: unknown): string | null => {
  const s = typeof v === "string" ? v.trim() : "";
  return s ? s : null;
};

export function parseCustomerInput(body: unknown): { ok: true; data: CustomerInput } | { ok: false; error: string } {
  const b = (body && typeof body === "object" ? body : {}) as Record<string, unknown>;
  const name = text(b.name);
  if (!name) return { ok: false, error: "Customer name is required." };
  const billingParty = String(b.billingParty ?? "pmi");
  if (!(billingParty in BILLING_PARTIES)) return { ok: false, error: "Unknown billing party." };
  const frequency = String(b.frequency ?? "monthly");
  if (!FREQUENCIES.some((f) => f.value === frequency)) return { ok: false, error: "Unknown frequency." };
  const startDate = String(b.startDate ?? "");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate)) return { ok: false, error: "Start date must be YYYY-MM-DD." };
  const rate = typeof b.rate === "number" ? b.rate : parseFloat(String(b.rate ?? "").replace(/[$,]/g, ""));
  if (!Number.isFinite(rate) || rate < 0) return { ok: false, error: "Rate must be a number of 0 or more." };
  return {
    ok: true,
    data: {
      billingParty,
      name,
      addr: text(b.addr),
      contact: text(b.contact),
      attn: text(b.attn),
      service: text(b.service),
      rate: Math.round(rate * 100) / 100,
      frequency,
      startDate,
      isActive: b.isActive !== false,
      rentvinePortfolioId: text(b.rentvinePortfolioId),
      rentvineContactId: text(b.rentvineContactId),
      notes: text(b.notes),
    },
  };
}
