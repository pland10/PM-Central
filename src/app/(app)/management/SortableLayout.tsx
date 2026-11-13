"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  closestCenter,
  pointerWithin,
  useSensor,
  useSensors,
  type CollisionDetection,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  rectSortingStrategy,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { createSupabaseBrowserClient } from "@/lib/auth/supabase-browser";
import {
  isDefaultLayout,
  moveWithin,
  reconcileLayout,
  toggleCollapsed,
  type DashboardLayout,
  type LayoutDefaults,
} from "@/lib/dashboard-layout";

// A sectioned dashboard the user can arrange: sections move up/down and
// collapse; inside a section its groups (tile row, chart grid) can swap; widgets
// reorder within their own group only. Each level is its own DndContext, so a
// drag can never cross into another group or section. Saved to the user's
// Supabase user_metadata.management_layout (follows them across devices) and
// mirrored to localStorage (instant; the fallback without a Supabase login).

export type LayoutWidget = { id: string; label: string; node: ReactNode; className?: string };
export type LayoutGroup = { id: string; label: string; gridClass: string; widgets: LayoutWidget[] };
export type LayoutSection = { id: string; title: string; groups: LayoutGroup[] };

const LS_KEY = "pmi.managementLayout";

// Drop onto whatever is under the pointer. Sections and groups differ a lot in
// height, and pure closest-center then favours the tall item's own slot (a short
// tile row can't swap with a tall chart grid). Keyboard drags have no pointer,
// so they fall back to closest-center.
const collision: CollisionDetection = (args) => {
  const hits = pointerWithin(args);
  return hits.length ? hits : closestCenter(args);
};

export function defaultsFor(sections: LayoutSection[]): LayoutDefaults {
  const d: LayoutDefaults = { root: sections.map((s) => s.id) };
  for (const s of sections) {
    d[s.id] = s.groups.map((g) => g.id);
    for (const g of s.groups) d[g.id] = g.widgets.map((w) => w.id);
  }
  return d;
}

export function SortableLayout({
  sections,
  initialLayout,
  canPersist,
}: {
  sections: LayoutSection[];
  initialLayout: unknown;
  canPersist: boolean;
}) {
  const defaults = useMemo(() => defaultsFor(sections), [sections]);
  const [layout, setLayout] = useState<DashboardLayout>(() => reconcileLayout(initialLayout, defaults));
  const [editing, setEditing] = useState(false);

  // No account layout (e.g. Basic Auth) → use this browser's copy after mount.
  useEffect(() => {
    if (initialLayout) return;
    try {
      const raw = localStorage.getItem(LS_KEY);
      if (raw) setLayout(reconcileLayout(JSON.parse(raw), defaults));
    } catch {
      /* ignore */
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function save(next: DashboardLayout | null) {
    try {
      if (next) localStorage.setItem(LS_KEY, JSON.stringify(next));
      else localStorage.removeItem(LS_KEY);
    } catch {
      /* ignore */
    }
    if (!canPersist) return;
    try {
      createSupabaseBrowserClient()
        .auth.updateUser({ data: { management_layout: next } })
        .catch(() => {});
    } catch {
      /* ignore */
    }
  }

  function update(next: DashboardLayout) {
    if (next === layout) return;
    setLayout(next);
    save(next);
  }

  function reset() {
    setLayout(reconcileLayout(null, defaults));
    save(null);
  }

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 180, tolerance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );
  const onDragEnd = (container: string) => (e: DragEndEvent) =>
    update(moveWithin(layout, container, String(e.active.id), e.over ? String(e.over.id) : null));

  const sectionById = new Map(sections.map((s) => [s.id, s]));
  const custom = !isDefaultLayout(layout, defaults);

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-end gap-2">
        {editing && (
          <span className="mr-auto text-sm text-brand-700">
            Drag the handles to reorder sections, groups or widgets. Saves automatically.
          </span>
        )}
        {custom && (
          <button onClick={reset} className="text-sm font-medium text-brand-600 hover:underline">
            Reset to default
          </button>
        )}
        <button
          onClick={() => setEditing((v) => !v)}
          className={
            editing
              ? "rounded-md border border-brand-500 bg-brand-500 px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-600"
              : "rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-600 hover:border-brand-500 hover:text-brand-600"
          }
        >
          {editing ? "Done" : "Rearrange"}
        </button>
      </div>

      <DndContext sensors={sensors} collisionDetection={collision} onDragEnd={onDragEnd("root")}>
        <SortableContext items={layout.order.root} strategy={verticalListSortingStrategy}>
          <div className="space-y-8">
            {layout.order.root.map((sid) => {
              const section = sectionById.get(sid);
              if (!section) return null;
              const collapsed = layout.collapsed.includes(sid);
              const groupById = new Map(section.groups.map((g) => [g.id, g]));
              return (
                <Sortable key={sid} id={sid} editing={editing}>
                  {(handle) => (
                    <section className={editing ? "rounded-xl p-2 ring-2 ring-brand-500/30" : undefined}>
                      <div className="mb-3 flex items-center gap-2">
                        {editing && <Handle {...handle} label={`Move section ${section.title}`} />}
                        <button
                          type="button"
                          onClick={() => update(toggleCollapsed(layout, sid))}
                          aria-label={`${collapsed ? "Expand" : "Collapse"} ${section.title}`}
                          aria-expanded={!collapsed}
                          className="rounded p-0.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                        >
                          <svg
                            width="14"
                            height="14"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2.5"
                            aria-hidden="true"
                            className={`transition-transform ${collapsed ? "-rotate-90" : ""}`}
                          >
                            <path d="M6 9l6 6 6-6" />
                          </svg>
                        </button>
                        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">{section.title}</h2>
                      </div>

                      {!collapsed && (
                        <DndContext sensors={sensors} collisionDetection={collision} onDragEnd={onDragEnd(sid)}>
                          <SortableContext items={layout.order[sid]} strategy={verticalListSortingStrategy}>
                            <div className="space-y-4">
                              {layout.order[sid].map((gid) => {
                                const group = groupById.get(gid);
                                if (!group) return null;
                                const widgetById = new Map(group.widgets.map((w) => [w.id, w]));
                                return (
                                  <Sortable key={gid} id={gid} editing={editing}>
                                    {(gHandle) => (
                                      <div className={editing ? "rounded-lg border border-dashed border-brand-500/40 p-2" : undefined}>
                                        {editing && (
                                          <div className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-brand-700">
                                            <Handle {...gHandle} label={`Move ${group.label} in ${section.title}`} />
                                            {group.label}
                                          </div>
                                        )}
                                        <DndContext sensors={sensors} collisionDetection={collision} onDragEnd={onDragEnd(gid)}>
                                          <SortableContext items={layout.order[gid]} strategy={rectSortingStrategy}>
                                            <div className={group.gridClass}>
                                              {layout.order[gid].map((wid) => {
                                                const w = widgetById.get(wid);
                                                if (!w) return null;
                                                return (
                                                  <Sortable key={wid} id={wid} editing={editing} className={`relative ${w.className ?? ""}`}>
                                                    {(wHandle) => (
                                                      <>
                                                        {editing && (
                                                          <div className="absolute right-1.5 top-1.5 z-10">
                                                            <Handle {...wHandle} label={`Move widget ${w.label}`} />
                                                          </div>
                                                        )}
                                                        <div className={editing ? "h-full ring-2 ring-brand-500/40 rounded-xl" : "h-full"}>{w.node}</div>
                                                      </>
                                                    )}
                                                  </Sortable>
                                                );
                                              })}
                                            </div>
                                          </SortableContext>
                                        </DndContext>
                                      </div>
                                    )}
                                  </Sortable>
                                );
                              })}
                            </div>
                          </SortableContext>
                        </DndContext>
                      )}
                    </section>
                  )}
                </Sortable>
              );
            })}
          </div>
        </SortableContext>
      </DndContext>
    </div>
  );
}

type HandleProps = { attributes: Record<string, unknown>; listeners: Record<string, unknown> | undefined };

// A sortable item that exposes its drag handle props to its children, so only
// the grip starts a drag (charts, tooltips and links keep working).
function Sortable({
  id,
  editing,
  className,
  children,
}: {
  id: string;
  editing: boolean;
  className?: string;
  children: (handle: HandleProps) => ReactNode;
}) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({
    id,
    disabled: !editing,
  });
  const style: React.CSSProperties = {
    transform: CSS.Translate.toString(transform),
    transition,
    zIndex: isDragging ? 30 : undefined,
    opacity: isDragging ? 0.85 : 1,
    position: "relative",
  };
  return (
    <div ref={setNodeRef} style={style} className={className}>
      {children({ attributes: { ...attributes, ref: setActivatorNodeRef }, listeners })}
    </div>
  );
}

function Handle({ attributes, listeners, label }: HandleProps & { label: string }) {
  const { ref, ...attrs } = attributes as { ref: (el: HTMLElement | null) => void } & Record<string, unknown>;
  return (
    <button
      type="button"
      ref={ref}
      {...attrs}
      {...listeners}
      aria-label={label}
      title={label}
      className="inline-flex cursor-grab touch-none items-center rounded bg-brand-600 p-1 text-white shadow active:cursor-grabbing"
    >
      <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
        <circle cx="8" cy="6" r="1.8" />
        <circle cx="16" cy="6" r="1.8" />
        <circle cx="8" cy="12" r="1.8" />
        <circle cx="16" cy="12" r="1.8" />
        <circle cx="8" cy="18" r="1.8" />
        <circle cx="16" cy="18" r="1.8" />
      </svg>
    </button>
  );
}
