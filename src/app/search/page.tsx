import { AppFrame } from "@/components/AppFrame";
import { SEARCH_URL } from "@/config/apps";

export const dynamic = "force-dynamic";

export default function SearchPage() {
  return <AppFrame title="Search" src={SEARCH_URL} />;
}
