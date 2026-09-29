import { AppFrame } from "@/components/AppFrame";
import { INSPECTIONS_URL } from "@/config/apps";

export const dynamic = "force-dynamic";

export default function InspectionsPage() {
  return <AppFrame title="Inspections" src={INSPECTIONS_URL} />;
}
