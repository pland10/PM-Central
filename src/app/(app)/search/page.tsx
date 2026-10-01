import { requireFeature } from "@/config/features";
import { SearchClient } from "./SearchClient";

export const dynamic = "force-dynamic";

export default function SearchPage() {
  requireFeature("search");
  return <SearchClient />;
}
