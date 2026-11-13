// Pure helpers for the app's top bar (src/app/(app)/layout.tsx), unit-tested.

export type PageLink = { href: string; label: string };

// "/ Dashboard" in the top bar: the menu item the current path belongs to.
// "/" only matches the dashboard itself; other items match their own path and
// anything under it (/properties/123 → Properties), longest match wins.
export function pageTitleFor(pathname: string, pages: PageLink[]): string | null {
  let best: PageLink | null = null;
  for (const p of pages) {
    const hit =
      p.href === "/" ? pathname === "/" : pathname === p.href || pathname.startsWith(`${p.href}/`);
    if (hit && (!best || p.href.length > best.href.length)) best = p;
  }
  return best?.label ?? null;
}

// Initials for the user circle: first + last word ("Jane Q Public" → "JP");
// an email uses the part before @, split on . _ -.
export function initialsOf(name: string): string {
  const base = name.includes("@") ? name.split("@")[0] : name;
  const words = base.split(/[\s._-]+/).filter(Boolean);
  if (words.length === 0) return "·";
  const first = words[0][0];
  const last = words.length > 1 ? words[words.length - 1][0] : "";
  return `${first}${last}`.toUpperCase();
}
