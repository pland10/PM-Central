import { AppFrame } from "@/components/AppFrame";
import { INVOICING_URL } from "@/config/apps";

export const dynamic = "force-dynamic";

export default function InvoicingPage() {
  return <AppFrame title="Invoicing" src={INVOICING_URL} />;
}
