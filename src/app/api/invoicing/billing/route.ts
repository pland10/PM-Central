import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth/supabase-server";
import { isFeatureEnabled } from "@/config/features";
import { partyOf } from "@/config/invoicing-parties";
import { billingRun, invoiceDraftForCustomer, isPeriodKey, type BillingSettings } from "@/lib/billing";
import { createNumberedInvoice } from "@/lib/invoice-number";

// Billing run: raise the invoices still missing for a period — every customer
// due that month who has no live invoice for it yet (or just `customer_ids`).
// Already-invoiced customers are skipped, so running it twice is harmless.
// Each invoice is a draft priced from the customer record.
export const dynamic = "force-dynamic";

function todayNY(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York" }).format(new Date());
}

export async function POST(req: NextRequest) {
  if (!isFeatureEnabled("invoicing")) return NextResponse.json({ error: "Invoicing is disabled." }, { status: 404 });
  if (!(await getCurrentUser())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const key = body?.period_key;
  if (!isPeriodKey(key)) return NextResponse.json({ error: "period_key must be YYYY-MM." }, { status: 400 });
  const only: string[] | null = Array.isArray(body?.customer_ids) ? body.customer_ids.map(String) : null;

  const [customers, invoices, setRow] = await Promise.all([
    prisma.invoiceCustomer.findMany({ where: { isActive: true }, orderBy: { name: "asc" } }),
    prisma.invoice.findMany({
      where: { periodKey: key, customerId: { not: null }, deletedAt: null },
      select: { id: true, number: true, status: true, customerId: true, periodKey: true },
    }),
    prisma.invoiceSetting.findUnique({ where: { id: 1 } }),
  ]);
  const settings = (setRow?.settings ?? {}) as BillingSettings;
  const run = billingRun(customers, invoices, key);
  const targets = only ? run.missing.filter((c) => only.includes(c.id)) : run.missing;

  const today = todayNY();
  const created: { customerId: string; id: string; number: string }[] = [];
  const errors: { customerId: string; error: string }[] = [];
  for (const c of targets) {
    const draft = invoiceDraftForCustomer(c, key, settings, today);
    try {
      const inv = await createNumberedInvoice(partyOf(c.billingParty).prefix, {
        ...draft,
        fromParty: draft.fromParty as unknown as Prisma.InputJsonValue,
        billTo: draft.billTo as unknown as Prisma.InputJsonValue,
        items: draft.items as unknown as Prisma.InputJsonValue,
      });
      if (inv) created.push({ customerId: c.id, id: inv.id, number: inv.number });
      else errors.push({ customerId: c.id, error: "Could not allocate an invoice number." });
    } catch (e) {
      errors.push({ customerId: c.id, error: e instanceof Error ? e.message : "Create failed" });
    }
  }
  return NextResponse.json({ created, skipped: run.rows.length - run.missing.length, errors });
}
