// Programs a property can be enrolled in, surfaced as tags on the Property.
// Tags flow in from the source (a Rentvine "property group" becomes a tag) and
// are stored as a comma-separated list of normalized slugs on Property.tags.
//
// Squatter Watch (a.k.a. home watch): properties we watch but never rent, so
// they are vacant by design. They must be kept OUT of the normal Properties list
// and out of vacancy/occupancy math, and shown on their own page instead.

export const SQUATTER_WATCH = "squatterwatch";

// Normalize any human tag / group name to a stable slug: lowercase, alphanumeric.
// "Squatter Watch", "squatterwatch", "Squatter-Watch" all become "squatterwatch".
export function tagSlug(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]/g, "");
}

// Parse the stored comma-separated tag string into slugs.
export function parseTags(tags: string | null | undefined): string[] {
  return tags ? tags.split(",").map((t) => t.trim()).filter(Boolean) : [];
}

export function hasTag(tags: string | null | undefined, slug: string): boolean {
  return parseTags(tags).includes(slug);
}

export function isSquatterWatch(tags: string | null | undefined): boolean {
  return hasTag(tags, SQUATTER_WATCH);
}
