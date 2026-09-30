import { AppFrame } from "@/components/AppFrame";
import { INVOICING_URL } from "@/config/apps";
import { requireFeature } from "@/config/features";

export const dynamic = "force-dynamic";

export default function InvoicingPage() {
  requireFeature("invoicing");
  return <AppFrame title="Invoicing" src={INVOICING_URL} />;
}
