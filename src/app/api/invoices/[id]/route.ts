import { NextRequest, NextResponse } from "next/server";
import { getInvoicingSupabase } from "@/lib/invoicing-supabase";
import { getCurrentUser } from "@/lib/auth/supabase-server";
import { isFeatureEnabled } from "@/config/features";

// Update an invoice (partial, over an allowlist) or soft-delete it. Writes to
// the live invoicing DB with the service key. from_party / billing_party are
// NOT editable after creation (the sender is fixed, as in the original app).
export const dynamic = "force-dynamic";

const EDITABLE = new Set([
  "invoice_date",
  "due_date",
  "period",
  "bill_to",
  "terms",
  "notes",
  "billing_contact",
  "tax_rate",
  "status",
  "items",
  "customer_id",
  "period_key",
]);

const STATUSES = new Set(["draft", "sent", "paid"]);

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!isFeatureEnabled("invoicing")) {
    return NextResponse.json({ error: "Invoicing is disabled." }, { status: 404 });
  }
  if (!(await getCurrentUser())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const db = getInvoicingSupabase();
  if (!db) return NextResponse.json({ error: "Invoicing not configured" }, { status: 503 });

  const { id } = await params;
  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Bad request" }, { status: 400 });
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const patch: Record<string, any> = {};
  for (const [k, v] of Object.entries(body)) {
    if (EDITABLE.has(k)) patch[k] = v;
  }
  if (patch.status != null && !STATUSES.has(patch.status)) {
    return NextResponse.json({ error: "Invalid status" }, { status: 400 });
  }
  if (typeof patch.tax_rate !== "undefined") patch.tax_rate = Number(patch.tax_rate) || 0;
  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
  }
  patch.updated_at = new Date().toISOString();

  const { error } = await db.from("invoices").update(patch).eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 502 });
  return NextResponse.json({ id });
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!isFeatureEnabled("invoicing")) {
    return NextResponse.json({ error: "Invoicing is disabled." }, { status: 404 });
  }
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  // Deleting a billing record is admin-only here; the standalone app's full
  // request/approve workflow remains the fallback for non-admins.
  if (user.role !== "admin") {
    return NextResponse.json({ error: "Deleting invoices is admin-only." }, { status: 403 });
  }
  const db = getInvoicingSupabase();
  if (!db) return NextResponse.json({ error: "Invoicing not configured" }, { status: 503 });

  const { id } = await params;
  const { error } = await db
    .from("invoices")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 502 });
  return NextResponse.json({ ok: true });
}
