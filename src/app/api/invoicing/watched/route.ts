import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { invoicingUser } from "@/lib/invoicing-gate";

// Add an address to the Squatter Watch programme list (what receipts can
// reference): a Rentvine property picked from PM-Central, or a typed address
// (e.g. a watch portfolio that has no property record).
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const g = await invoicingUser();
  if ("res" in g) return g.res;
  const b = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const address = typeof b.address === "string" ? b.address.trim() : "";
  if (!address) return NextResponse.json({ error: "Address is required." }, { status: 400 });
  const rvId = typeof b.rentvinePropertyId === "string" && b.rentvinePropertyId.trim() ? b.rentvinePropertyId.trim() : null;
  const label = typeof b.label === "string" && b.label.trim() ? b.label.trim() : null;
  try {
    const w = await prisma.watchedProperty.create({
      data: { address, label, source: rvId ? "property" : "manual", rentvinePropertyId: rvId },
      select: { id: true },
    });
    return NextResponse.json({ id: w.id }, { status: 201 });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      return NextResponse.json({ error: "That property is already on the list." }, { status: 409 });
    }
    return NextResponse.json({ error: e instanceof Error ? e.message : "Add failed" }, { status: 502 });
  }
}
