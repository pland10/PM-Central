import { NextRequest, NextResponse } from "next/server";
import { getInvoicingSupabase } from "@/lib/invoicing-supabase";
import { getCurrentUser } from "@/lib/auth/supabase-server";
import { isFeatureEnabled } from "@/config/features";
import type { InvoiceSettings, InvoiceParty } from "@/lib/invoices";
import { BILLING_PARTIES, DEFAULT_PARTY, partyOf, DEFAULT_BILL_TO } from "@/config/invoicing-parties";

// Create an invoice. Writes to the live invoicing DB (service key). An invoice
// is inserted immediately to CLAIM its number (as a draft), then edited. Number
// = party prefix + (highest existing with that prefix + 1); the DB's unique
// constraint is the real guard, so on a collision we retry.
export const dynamic = "force-dynamic";

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}
function termDays(terms: string | undefined): number {
  const m = /(\d+)/.exec(terms || "");
  return m ? Number(m[1]) : 30;
}
function addDays(iso: string, days: number): string {
  const d = new Date(iso + "T00:00:00");
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}
function pad4(n: number): string {
  return String(n).padStart(4, "0");
}

export async function POST(req: NextRequest) {
  if (!isFeatureEnabled("invoicing")) {
    return NextResponse.json({ error: "Invoicing is disabled." }, { status: 404 });
  }
  if (!(await getCurrentUser())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const db = getInvoicingSupabase();
  if (!db) return NextResponse.json({ error: "Invoicing not configured" }, { status: 503 });

  const body = await req.json().catch(() => ({}));
  const partyKey = (body?.billing_party as string) in BILLING_PARTIES ? body.billing_party : DEFAULT_PARTY;
  const party = partyOf(partyKey);

  // Defaults from app_settings (id = 1).
  const setRes = await db.from("app_settings").select("settings").eq("id", 1).maybeSingle();
  const settings: InvoiceSettings = setRes.data?.settings ?? {};
  const billTo: InvoiceParty =
    settings.billTo && settings.billTo.addr ? settings.billTo : DEFAULT_BILL_TO;
  const terms = settings.terms || "Net 30";
  const taxRate = Number(settings.taxRate) || 0;
  const notes = settings.notesByParty?.[partyKey]?.trim() || party.notes;

  // Highest existing number for this prefix (INCLUDING soft-deleted rows).
  const numRes = await db.from("invoices").select("number").like("number", `${party.prefix}%`);
  if (numRes.error) return NextResponse.json({ error: numRes.error.message }, { status: 502 });
  let max = 0;
  const re = new RegExp(`^${party.prefix}(\\d+)$`);
  for (const r of numRes.data ?? []) {
    const m = re.exec((r as { number?: string }).number || "");
    if (m) max = Math.max(max, Number(m[1]));
  }

  const date = todayISO();
  const baseRow = {
    invoice_date: date,
    due_date: addDays(date, termDays(terms)),
    period: null,
    from_party: party.from,
    bill_to: billTo,
    terms,
    notes,
    billing_contact: null,
    tax_rate: taxRate,
    status: "draft" as const,
    items: [{ desc: "", qty: 1, rate: "" }],
    billing_party: partyKey,
    customer_id: null,
    period_key: null,
  };

  for (let attempt = 0; attempt < 4; attempt++) {
    const number = party.prefix + pad4(max + 1 + attempt);
    const { data, error } = await db
      .from("invoices")
      .insert({ ...baseRow, number })
      .select("id")
      .single();
    if (!error && data) return NextResponse.json({ id: data.id }, { status: 201 });
    if (error && error.code !== "23505") {
      return NextResponse.json({ error: error.message }, { status: 502 });
    }
    // 23505 = unique collision on number; bump and retry.
  }
  return NextResponse.json({ error: "Could not allocate an invoice number. Try again." }, { status: 409 });
}
