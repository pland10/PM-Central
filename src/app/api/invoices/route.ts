import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth/supabase-server";
import { isFeatureEnabled } from "@/config/features";
import type { InvoiceSettings, InvoiceParty } from "@/lib/invoices";
import { BILLING_PARTIES, DEFAULT_PARTY, partyOf, DEFAULT_BILL_TO } from "@/config/invoicing-parties";

// Create an invoice in PM-Central's single database (Prisma/Postgres). An
// invoice is inserted immediately to CLAIM its number (as a draft), then edited.
// Number = party prefix + (highest existing with that prefix + 1); the unique
// constraint on `number` is the real guard, so on a collision we retry.
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

  const body = await req.json().catch(() => ({}));
  const partyKey = (body?.billing_party as string) in BILLING_PARTIES ? body.billing_party : DEFAULT_PARTY;
  const party = partyOf(partyKey);

  // Defaults from the single-row invoice settings (id = 1).
  const setRow = await prisma.invoiceSetting.findUnique({ where: { id: 1 } });
  const settings: InvoiceSettings = (setRow?.settings as InvoiceSettings) ?? {};
  const billTo: InvoiceParty =
    settings.billTo && settings.billTo.addr ? settings.billTo : DEFAULT_BILL_TO;
  const terms = settings.terms || "Net 30";
  const taxRate = Number(settings.taxRate) || 0;
  const notes = settings.notesByParty?.[partyKey]?.trim() || party.notes;

  // Highest existing number for this prefix (INCLUDING soft-deleted rows).
  const existing = await prisma.invoice.findMany({
    where: { number: { startsWith: party.prefix } },
    select: { number: true },
  });
  let max = 0;
  const re = new RegExp(`^${party.prefix}(\\d+)$`);
  for (const r of existing) {
    const m = re.exec(r.number || "");
    if (m) max = Math.max(max, Number(m[1]));
  }

  const date = todayISO();
  const baseData = {
    invoiceDate: date,
    dueDate: addDays(date, termDays(terms)),
    period: null,
    fromParty: party.from as unknown as Prisma.InputJsonValue,
    billTo: billTo as unknown as Prisma.InputJsonValue,
    terms,
    notes,
    billingContact: null,
    taxRate,
    status: "draft",
    items: [{ desc: "", qty: 1, rate: "" }] as unknown as Prisma.InputJsonValue,
    billingParty: partyKey,
    customerId: null,
    periodKey: null,
  };

  for (let attempt = 0; attempt < 4; attempt++) {
    const number = party.prefix + pad4(max + 1 + attempt);
    try {
      const created = await prisma.invoice.create({
        data: { ...baseData, number },
        select: { id: true },
      });
      return NextResponse.json({ id: created.id }, { status: 201 });
    } catch (e) {
      // P2002 = unique constraint violation on `number`; bump and retry.
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") continue;
      const message = e instanceof Error ? e.message : "Create failed";
      return NextResponse.json({ error: message }, { status: 502 });
    }
  }
  return NextResponse.json({ error: "Could not allocate an invoice number. Try again." }, { status: 409 });
}
