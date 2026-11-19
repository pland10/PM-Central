import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { formatAddress } from "@/lib/format";
import { getCurrentUser } from "@/lib/auth/supabase-server";
import { splitMeetingGroups } from "@/lib/meetings";
import { getPropertyOrder } from "@/lib/meetings-db";
import { PropertyOrderManager, type OrderItem } from "./PropertyOrderManager";

// Admin → Property order: set the custom sequence the houses appear in on the
// Monday tactical sheet (instead of alphabetical). Rental Units and Squatter
// Watch are ordered separately.
export const dynamic = "force-dynamic";

export default async function PropertyOrderPage() {
  const user = await getCurrentUser();
  if (!user || user.role !== "admin") notFound();

  const [properties, order] = await Promise.all([
    prisma.property.findMany({
      orderBy: { createdAt: "asc" },
      select: { id: true, name: true, street1: true, street2: true, city: true, state: true, zip: true, tags: true },
    }),
    getPropertyOrder().catch(() => ({}) as Record<string, number>),
  ]);

  const rows = properties.map((p) => ({
    id: p.id,
    tags: p.tags,
    sortKey: p.name || p.street1,
    label: p.name || p.street1,
    address: formatAddress(p),
  }));
  const { rentals, squatterWatch } = splitMeetingGroups(rows, order);
  const toItem = (r: (typeof rows)[number]): OrderItem => ({ id: r.id, label: r.label, address: r.address });

  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">Property order</h1>
        <p className="mt-1 text-sm text-slate-500">
          Drag the houses into the order you want to walk them on the{" "}
          <Link href="/meetings" className="font-medium text-brand-600 hover:underline">
            Monday tactical meeting
          </Link>
          . Rental Units and Squatter Watch are sequenced separately. New houses start at the end of their group until you
          place them.
        </p>
      </div>
      <PropertyOrderManager initialRentals={rentals.map(toItem)} initialSquatter={squatterWatch.map(toItem)} />
    </div>
  );
}
