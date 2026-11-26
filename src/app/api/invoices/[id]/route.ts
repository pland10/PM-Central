import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth/supabase-server";
import { isFeatureEnabled } from "@/config/features";

// Update an invoice (partial, over an allowlist) or discard a draft.
// Stale-copy guard: the editor sends base_updated_at (the version it loaded or
// last saved). The update only applies if the invoice is still at that version;
// otherwise 409, so an old copy (back button, second tab, a save still in
// flight) can never overwrite a newer one — e.g. silently dropping a line. Writes to
// PM-Central's single database (Prisma/Postgres). from_party / billing_party are
// NOT editable after creation (the sender is fixed, as in the original app).
export const dynamic = "force-dynamic";

// Editable fields, mapping the app's snake_case payload to Prisma camelCase.
const FIELD_MAP: Record<string, string> = {
  invoice_date: "invoiceDate",
  due_date: "dueDate",
  period: "period",
  bill_to: "billTo",
  terms: "terms",
  notes: "notes",
  billing_contact: "billingContact",
  tax_rate: "taxRate",
  status: "status",
  items: "items",
  customer_id: "customerId",
  period_key: "periodKey",
  property_external_id: "propertyExternalId",
};

const STATUSES = new Set(["draft", "sent", "paid"]);

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!isFeatureEnabled("invoicing")) {
    return NextResponse.json({ error: "Invoicing is disabled." }, { status: 404 });
  }
  if (!(await getCurrentUser())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Bad request" }, { status: 400 });
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const data: Record<string, any> = {};
  for (const [k, v] of Object.entries(body)) {
    const col = FIELD_MAP[k];
    if (col) data[col] = v;
  }
  if (data.status != null && !STATUSES.has(data.status)) {
    return NextResponse.json({ error: "Invalid status" }, { status: 400 });
  }
  if (typeof data.taxRate !== "undefined") data.taxRate = Number(data.taxRate) || 0;
  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
  }
  const baseRaw = (body as { base_updated_at?: unknown }).base_updated_at;
  const base = typeof baseRaw === "string" ? new Date(baseRaw) : null;
  if (baseRaw !== undefined && baseRaw !== null && (!base || Number.isNaN(base.getTime()))) {
    return NextResponse.json({ error: "Bad base_updated_at" }, { status: 400 });
  }

  try {
    if (base) {
      const { count } = await prisma.invoice.updateMany({
        where: { id, updatedAt: base },
        data: data as Prisma.InvoiceUpdateManyMutationInput,
      });
      const now = await prisma.invoice.findUnique({ where: { id }, select: { updatedAt: true } });
      if (!now) return NextResponse.json({ error: "Not found" }, { status: 404 });
      if (count === 0) {
        return NextResponse.json(
          {
            error: "This invoice was changed since you opened it. Reload to see the latest — your last edit wasn't saved.",
            conflict: true,
          },
          { status: 409 }
        );
      }
      return NextResponse.json({ id, updated_at: now.updatedAt.toISOString() });
    }
    const saved = await prisma.invoice.update({ where: { id }, data: data as Prisma.InvoiceUpdateInput });
    return NextResponse.json({ id, updated_at: saved.updatedAt ? saved.updatedAt.toISOString() : null });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2025") {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    const message = e instanceof Error ? e.message : "Update failed";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!isFeatureEnabled("invoicing")) {
    return NextResponse.json({ error: "Invoicing is disabled." }, { status: 404 });
  }
  if (!(await getCurrentUser())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  // Only DRAFT invoices can be discarded here — a hard delete that frees the
  // number (used by the editor's "Discard"). Sent/paid invoices are kept.
  const cur = await prisma.invoice.findUnique({ where: { id }, select: { status: true } });
  if (!cur) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (cur.status !== "draft") {
    return NextResponse.json(
      { error: "Only draft invoices can be discarded." },
      { status: 403 }
    );
  }
  try {
    await prisma.invoice.delete({ where: { id } });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Delete failed";
    return NextResponse.json({ error: message }, { status: 502 });
  }
  return NextResponse.json({ ok: true });
}
