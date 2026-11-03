import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { invoicingUser } from "@/lib/invoicing-gate";
import { parseReceiptInput } from "@/lib/receipts";

// Save an inspector receipt, or (admins only) delete it. Deleting is soft:
// the record is kept, it just stops appearing — as in the original app.
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

export async function PATCH(req: NextRequest, { params }: Ctx) {
  const g = await invoicingUser();
  if ("res" in g) return g.res;
  const { id } = await params;
  const parsed = parseReceiptInput(await req.json().catch(() => null));
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });
  try {
    await prisma.inspectorReceipt.update({ where: { id }, data: parsed.data });
  } catch {
    return NextResponse.json({ error: "Receipt not found." }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: NextRequest, { params }: Ctx) {
  const g = await invoicingUser();
  if ("res" in g) return g.res;
  if (g.user.role !== "admin") return NextResponse.json({ error: "Only an admin can delete a receipt." }, { status: 403 });
  const { id } = await params;
  try {
    await prisma.inspectorReceipt.update({ where: { id }, data: { deletedAt: new Date() } });
  } catch {
    return NextResponse.json({ error: "Receipt not found." }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}
