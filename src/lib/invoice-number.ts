import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

// Create an invoice under the next number for its billing party's prefix
// (highest existing with that prefix — INCLUDING soft-deleted rows — plus one).
// The unique constraint on `number` is the real guard: on a collision (someone
// took that number meanwhile) we try the next one. Shared by the manual "New
// invoice" button and the billing run.
//
// Optional floor INVOICE_NUMBER_START (dev uses e.g. 4000 so dev invoices look
// distinct from prod); unset on prod to continue the normal sequence.
export async function createNumberedInvoice(
  prefix: string,
  data: Omit<Prisma.InvoiceCreateInput, "number">
): Promise<{ id: string; number: string } | null> {
  const existing = await prisma.invoice.findMany({
    where: { number: { startsWith: prefix } },
    select: { number: true },
  });
  let max = 0;
  const re = new RegExp(`^${prefix}(\\d+)$`);
  for (const r of existing) {
    const m = re.exec(r.number || "");
    if (m) max = Math.max(max, Number(m[1]));
  }
  const startAt = Math.max(0, parseInt(process.env.INVOICE_NUMBER_START ?? "", 10) || 0);
  const base = Math.max(max + 1, startAt);

  for (let attempt = 0; attempt < 4; attempt++) {
    const number = prefix + String(base + attempt).padStart(4, "0");
    try {
      return await prisma.invoice.create({ data: { ...data, number }, select: { id: true, number: true } });
    } catch (e) {
      // P2002 = unique violation; bump the number and retry.
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") continue;
      throw e;
    }
  }
  return null;
}
