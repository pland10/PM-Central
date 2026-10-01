import Link from "next/link";
import { requireFeature } from "@/config/features";
import { InspectionForm } from "../InspectionForm";

export const dynamic = "force-dynamic";

export default function NewInspectionPage() {
  requireFeature("inspections");
  return (
    <div className="mx-auto max-w-2xl">
      <Link href="/inspections" className="text-sm text-slate-500 hover:text-brand-600">
        ← All inspections
      </Link>
      <h1 className="mb-4 mt-2 text-lg font-semibold text-ink">New inspection</h1>
      <InspectionForm />
    </div>
  );
}
