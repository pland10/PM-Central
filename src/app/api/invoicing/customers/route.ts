import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth/supabase-server";
import { isFeatureEnabled } from "@/config/features";
import { parseCustomerInput } from "@/lib/invoice-customers";

// Create a recurring-billing customer (Invoicing → Customers).
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  if (!isFeatureEnabled("invoicing")) return NextResponse.json({ error: "Invoicing is disabled." }, { status: 404 });
  if (!(await getCurrentUser())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = parseCustomerInput(await req.json().catch(() => null));
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });
  const created = await prisma.invoiceCustomer.create({ data: parsed.data, select: { id: true } });
  return NextResponse.json({ id: created.id }, { status: 201 });
}
