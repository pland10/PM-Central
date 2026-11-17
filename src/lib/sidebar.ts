// Cookie that remembers whether the desktop sidebar is collapsed. Lives outside
// the "use client" component so the server layout can import the plain string
// (exports of a client module arrive on the server as client references).
export const SIDEBAR_COOKIE = "pmc_sidebar";

// Which headed menu sections (Property Data, Admin…) the user has folded away.
// Stored as a comma list of section ids in a cookie so the server renders them
// closed on the next page (no flash).
export const NAV_SECTIONS_COOKIE = "pmc_nav_closed";

export function sectionId(heading: string): string {
  return heading.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

export function parseClosedSections(raw: string | undefined | null): string[] {
  const out: string[] = [];
  for (const part of (raw ?? "").split(",")) {
    const id = part.trim();
    if (/^[a-z0-9-]{1,40}$/.test(id) && !out.includes(id)) out.push(id);
  }
  return out;
}

export function serializeClosedSections(ids: string[]): string {
  return parseClosedSections(ids.join(",")).join(",");
}
