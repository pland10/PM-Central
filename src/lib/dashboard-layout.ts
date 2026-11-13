// User-arrangeable layout for a sectioned dashboard (the Management Dashboard).
// Pure — no DOM or storage — so it's unit-tested on its own.
//
// The layout is a set of containers, each an ordered list of child ids:
//   "root"            → section ids
//   "<section>"       → that section's group ids (e.g. tiles row, charts grid)
//   "<section>.<grp>" → that group's widget ids
// Moves only ever happen inside one container, so a widget can be reordered
// within its group but can never move to another group or section.

export type LayoutDefaults = Record<string, string[]>;
export type DashboardLayout = { order: Record<string, string[]>; collapsed: string[] };

const isStringArray = (x: unknown): x is string[] => Array.isArray(x) && x.every((v) => typeof v === "string");

// Merge a saved layout (any shape — it comes from user metadata / localStorage)
// onto the current defaults: keep the saved order for ids that still exist in
// that same container, drop the rest, append anything new.
export function reconcileLayout(saved: unknown, defaults: LayoutDefaults): DashboardLayout {
  const s = (saved && typeof saved === "object" ? saved : {}) as { order?: unknown; collapsed?: unknown };
  const savedOrder = (s.order && typeof s.order === "object" ? s.order : {}) as Record<string, unknown>;

  const order: Record<string, string[]> = {};
  for (const [container, ids] of Object.entries(defaults)) {
    const prev = savedOrder[container];
    const known = new Set(ids);
    const kept = isStringArray(prev) ? prev.filter((id, i) => known.has(id) && prev.indexOf(id) === i) : [];
    order[container] = [...kept, ...ids.filter((id) => !kept.includes(id))];
  }

  const sections = new Set(defaults.root ?? []);
  const collapsed = Array.isArray(s.collapsed)
    ? s.collapsed.filter((id, i, a): id is string => typeof id === "string" && sections.has(id) && a.indexOf(id) === i)
    : [];

  return { order, collapsed };
}

// Move `activeId` to `overId`'s position, only if both live in `container`.
// Returns the same object when nothing changes.
export function moveWithin(
  layout: DashboardLayout,
  container: string,
  activeId: string,
  overId: string | null | undefined
): DashboardLayout {
  if (!overId || activeId === overId) return layout;
  const list = layout.order[container];
  if (!list) return layout;
  const from = list.indexOf(activeId);
  const to = list.indexOf(overId);
  if (from === -1 || to === -1) return layout;
  const next = list.slice();
  next.splice(from, 1);
  next.splice(to, 0, activeId);
  return { ...layout, order: { ...layout.order, [container]: next } };
}

export function toggleCollapsed(layout: DashboardLayout, sectionId: string): DashboardLayout {
  const collapsed = layout.collapsed.includes(sectionId)
    ? layout.collapsed.filter((id) => id !== sectionId)
    : [...layout.collapsed, sectionId];
  return { ...layout, collapsed };
}

export function isDefaultLayout(layout: DashboardLayout, defaults: LayoutDefaults): boolean {
  if (layout.collapsed.length > 0) return false;
  return Object.entries(defaults).every(([c, ids]) => (layout.order[c] ?? []).join("|") === ids.join("|"));
}
