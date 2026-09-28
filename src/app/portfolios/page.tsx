import { prisma } from "@/lib/prisma";
import { formatCurrency } from "@/lib/format";
import { PortfoliosTable, type PortfolioRow } from "./PortfoliosTable";

export const dynamic = "force-dynamic";

export default async function PortfoliosPage() {
  const portfolios = await prisma.portfolio.findMany({
    include: {
      properties: { include: { units: { include: { leases: true } } } },
    },
  });

  const rows: PortfolioRow[] = portfolios.map((pf) => {
    let unitCount = 0;
    let occupied = 0;
    let rentRoll = 0;
    for (const property of pf.properties) {
      for (const unit of property.units) {
        unitCount += 1;
        const active = unit.leases.find((l) => l.status === "active");
        if (active) {
          occupied += 1;
          rentRoll += active.rent;
        }
      }
    }
    return {
      id: pf.id,
      name: pf.name,
      propertyCount: pf.properties.length,
      unitCount,
      occupied,
      rentRoll,
    };
  });

  const totalRentRoll = rows.reduce((s, r) => s + r.rentRoll, 0);

  return (
    <div className="mx-auto max-w-6xl">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">Portfolios</h1>
        <p className="mt-1 text-sm text-slate-500">
          {portfolios.length} owner{portfolios.length === 1 ? "" : "s"} ·{" "}
          {formatCurrency(totalRentRoll)}/mo in rent roll across the book.
        </p>
      </div>

      <PortfoliosTable rows={rows} />
    </div>
  );
}
