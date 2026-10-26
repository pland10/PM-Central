import { requireFeature } from "@/config/features";
import { SearchClient } from "./SearchClient";

export const dynamic = "force-dynamic";

export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<{ types?: string | string[] }>;
}) {
  requireFeature("search");
  const { types } = await searchParams;
  const initialTypes = Array.isArray(types) ? types.join(",") : types;
  // Keyed so following a different ?types= link while on /search resets the filter.
  return <SearchClient key={initialTypes ?? ""} initialTypes={initialTypes} />;
}
