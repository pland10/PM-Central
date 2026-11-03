import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth/supabase-server";
import { isFeatureEnabled } from "@/config/features";
import { parseCustomerInput } from "@/lib/invoice-customers";

// Edit or delete a recurring-billing customer. Deleting keeps their invoices
// (Invoice.customerId just stops matching a customer).
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

async function gate(): Promise<NextResponse | null> {
  if (!isFeatureEnabled("invoicing")) return NextResponse.json({ error: "Invoicing is disabled." }, { status: 404 });
  if (!(await getCurrentUser())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return null;
}

export async function PATCH(req: NextRequest, { params }: Ctx) {
  const denied = await gate();
  if (denied) return denied;
  const { id } = await params;
  const parsed = parseCustomerInput(await req.json().catch(() => null));
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });
  try {
    await prisma.invoiceCustomer.update({ where: { id }, data: parsed.data });
  } catch {
    return NextResponse.json({ error: "Customer not found." }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: NextRequest, { params }: Ctx) {
  const denied = await gate();
  if (denied) return denied;
  const { id } = await params;
  try {
    await prisma.invoiceCustomer.delete({ where: { id } });
  } catch {
    return NextResponse.json({ error: "Customer not found." }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}
