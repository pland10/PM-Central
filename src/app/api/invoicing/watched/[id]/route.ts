import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { invoicingUser } from "@/lib/invoicing-gate";

// Take a watched property out of the programme (or put it back), or delete it.
// Past receipts keep the address they were written with either way.
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

export async function PATCH(req: NextRequest, { params }: Ctx) {
  const g = await invoicingUser();
  if ("res" in g) return g.res;
  const { id } = await params;
  const b = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  if (typeof b.isActive !== "boolean") return NextResponse.json({ error: "isActive must be true or false." }, { status: 400 });
  try {
    await prisma.watchedProperty.update({ where: { id }, data: { isActive: b.isActive } });
  } catch {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: NextRequest, { params }: Ctx) {
  const g = await invoicingUser();
  if ("res" in g) return g.res;
  const { id } = await params;
  try {
    await prisma.watchedProperty.delete({ where: { id } });
  } catch {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}
