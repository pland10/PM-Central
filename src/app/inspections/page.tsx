import { AppFrame } from "@/components/AppFrame";
import { INSPECTIONS_URL } from "@/config/apps";
import { requireFeature } from "@/config/features";

export const dynamic = "force-dynamic";

export default function InspectionsPage() {
  requireFeature("inspections");
  return <AppFrame title="Inspections" src={INSPECTIONS_URL} />;
}
