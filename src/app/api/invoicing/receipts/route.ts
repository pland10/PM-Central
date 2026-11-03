import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { BILLING_PARTIES, partyOf } from "@/config/invoicing-parties";
import { invoicingUser } from "@/lib/invoicing-gate";
import { nextReceiptNumber } from "@/lib/receipts";

// Create a new inspector receipt under the party's next receipt number (claimed
// immediately, then edited). The unique `number` is the real guard: on a
// collision we take the next one.
export const dynamic = "force-dynamic";

function todayNY(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York" }).format(new Date());
}

export async function POST(req: NextRequest) {
  const g = await invoicingUser();
  if ("res" in g) return g.res;

  const body = await req.json().catch(() => ({}));
  const party = partyOf((body?.billing_party as string) in BILLING_PARTIES ? body.billing_party : "pmi");
  const existing = await prisma.inspectorReceipt.findMany({
    where: { number: { startsWith: party.receiptPrefix } },
    select: { number: true },
  });
  const first = nextReceiptNumber(party.receiptPrefix, existing.map((r) => r.number));
  const base = Number(first.slice(party.receiptPrefix.length));

  for (let attempt = 0; attempt < 4; attempt++) {
    const number = party.receiptPrefix + String(base + attempt).padStart(4, "0");
    try {
      const r = await prisma.inspectorReceipt.create({
        data: {
          number,
          billingParty: party.key,
          inspector: "",
          paidOn: todayNY(),
          items: [{ property: "", at: "", amount: "" }],
        },
        select: { id: true },
      });
      return NextResponse.json({ id: r.id }, { status: 201 });
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") continue;
      return NextResponse.json({ error: e instanceof Error ? e.message : "Create failed" }, { status: 502 });
    }
  }
  return NextResponse.json({ error: "Could not allocate a receipt number. Try again." }, { status: 409 });
}
