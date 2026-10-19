import Link from "next/link";
import { requireFeature } from "@/config/features";
import { InspectionForm } from "../InspectionForm";
import { MoveInForm } from "../MoveInForm";
import { isMoveInType } from "@/lib/inspections/move-in-template";

export const dynamic = "force-dynamic";

export default async function NewInspectionPage({
  searchParams,
}: {
  searchParams: Promise<{ type?: string }>;
}) {
  requireFeature("inspections");
  const moveIn = isMoveInType((await searchParams).type);
  return (
    <div className="mx-auto max-w-2xl">
      <Link href="/inspections" className="text-sm text-slate-500 hover:text-brand-600">
        ← All inspections
      </Link>
      <h1 className="mb-4 mt-2 text-lg font-semibold text-ink">
        {moveIn ? "New move-in inspection" : "New inspection"}
      </h1>
      {moveIn ? <MoveInForm /> : <InspectionForm />}
    </div>
  );
}
