import { requireFeature } from "@/config/features";
import { prisma } from "@/lib/prisma";
import { loadWatched } from "@/lib/receipts-db";
import { InvoicingTabs } from "../InvoicingTabs";
import { SetupNeeded } from "../customers/SetupNeeded";
import { WatchedView, type Candidate } from "./WatchedView";

// The Squatter Watch programme list: the addresses inspector receipts can
// reference. Add a Rentvine property (from PM-Central's synced properties) or
// type an address (watch portfolios with no property record).
export const dynamic = "force-dynamic";

export default async function WatchedPropertiesPage() {
  requireFeature("invoicing");
  const watched = await loadWatched();
  if (!watched) {
    return (
      <div>
        <InvoicingTabs />
        <SetupNeeded />
      </div>
    );
  }
  const props = await prisma.property.findMany({
    where: { status: "active", externalId: { not: null } },
    select: { externalId: true, street1: true, city: true, state: true, zip: true, portfolio: { select: { name: true } } },
    orderBy: { street1: "asc" },
  });
  const candidates: Candidate[] = props.map((p) => ({
    // Property.externalId is namespaced ("<account>:property:<id>"); the
    // Rentvine property id is the last segment.
    rentvinePropertyId: String(p.externalId).split(":").pop() ?? "",
    address: [p.street1, [p.city, [p.state, p.zip].filter(Boolean).join(" ")].filter(Boolean).join(", ")].filter(Boolean).join(", "),
    label: p.portfolio?.name ?? "",
  }));

  return (
    <div>
      <InvoicingTabs />
      <WatchedView watched={watched} candidates={candidates} />
    </div>
  );
}
