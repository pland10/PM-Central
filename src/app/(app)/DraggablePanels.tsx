"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  DndContext,
  PointerSensor,
  TouchSensor,
  KeyboardSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  rectSortingStrategy,
  sortableKeyboardCoordinates,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { createSupabaseBrowserClient } from "@/lib/auth/supabase-browser";
import { useDashboardEdit } from "./DashboardEdit";

// Drag-to-rearrange dashboard panels. The order is saved to the signed-in
// user's Supabase user_metadata (follows them across devices) and mirrored to
// localStorage (instant, and the fallback when not signed in, e.g. Basic Auth).

export type PanelItem = { id: string; node: ReactNode };

const LS_KEY = "pmi.dashboardOrder";
const LS_HIDDEN_KEY = "pmi.dashboardHidden";

// Keep only ids that still exist, in saved order, then append any new panels.
function reconcile(saved: string[], ids: string[]): string[] {
  const known = new Set(ids);
  const kept = saved.filter((id) => known.has(id));
  const missing = ids.filter((id) => !kept.includes(id));
  return [...kept, ...missing];
}

// Hidden is just a filter over the live ids — drop any stale/unknown ids.
function reconcileHidden(saved: string[], ids: string[]): string[] {
  const known = new Set(ids);
  return saved.filter((id) => known.has(id));
}

export function DraggablePanels({
  items,
  initialOrder,
  initialHidden,
  canPersist,
}: {
  items: PanelItem[];
  initialOrder: string[] | null;
  initialHidden: string[] | null;
  canPersist: boolean;
}) {
  const { editing } = useDashboardEdit();
  const ids = useMemo(() => items.map((i) => i.id), [items]);
  const byId = useMemo(() => new Map(items.map((i) => [i.id, i.node])), [items]);

  // Server-provided order (from the account) avoids a reorder flash; localStorage
  // is applied after mount when the server had none (not signed in).
  const [order, setOrder] = useState<string[]>(() =>
    reconcile(initialOrder ?? [], ids)
  );
  const [hidden, setHidden] = useState<string[]>(() =>
    reconcileHidden(initialHidden ?? [], ids)
  );

  useEffect(() => {
    if (initialOrder && initialOrder.length) return; // account order already applied
    try {
      const raw = localStorage.getItem(LS_KEY);
      if (raw) setOrder(reconcile(JSON.parse(raw) as string[], ids));
      const rawHidden = localStorage.getItem(LS_HIDDEN_KEY);
      if (rawHidden) setHidden(reconcileHidden(JSON.parse(rawHidden) as string[], ids));
    } catch {
      /* ignore */
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 180, tolerance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  function persist(nextOrder: string[], nextHidden: string[]) {
    try {
      localStorage.setItem(LS_KEY, JSON.stringify(nextOrder));
      localStorage.setItem(LS_HIDDEN_KEY, JSON.stringify(nextHidden));
    } catch {
      /* ignore */
    }
    if (!canPersist) return;
    try {
      createSupabaseBrowserClient()
        .auth.updateUser({ data: { dashboard_order: nextOrder, dashboard_hidden: nextHidden } })
        .catch(() => {});
    } catch {
      /* ignore */
    }
  }

  function onDragEnd(e: DragEndEvent) {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    setOrder((prev) => {
      const from = prev.indexOf(String(active.id));
      const to = prev.indexOf(String(over.id));
      if (from === -1 || to === -1) return prev;
      const next = arrayMove(prev, from, to);
      persist(next, hidden);
      return next;
    });
  }

  // Hiding moves the panel to the end of the order (so it sits at the bottom)
  // and flags it hidden; showing just clears the flag, leaving it at the bottom.
  function hide(id: string) {
    const nextOrder = [...order.filter((x) => x !== id), id];
    const nextHidden = hidden.includes(id) ? hidden : [...hidden, id];
    setOrder(nextOrder);
    setHidden(nextHidden);
    persist(nextOrder, nextHidden);
  }
  function show(id: string) {
    const nextHidden = hidden.filter((x) => x !== id);
    setHidden(nextHidden);
    persist(order, nextHidden);
  }

  const isCustom = order.join("|") !== ids.join("|") || hidden.length > 0;
  function reset() {
    try {
      localStorage.removeItem(LS_KEY);
      localStorage.removeItem(LS_HIDDEN_KEY);
    } catch {
      /* ignore */
    }
    if (canPersist) {
      try {
        createSupabaseBrowserClient()
          .auth.updateUser({ data: { dashboard_order: null, dashboard_hidden: null } })
          .catch(() => {});
      } catch {
        /* ignore */
      }
    }
    setOrder(ids);
    setHidden([]);
  }

  const hiddenSet = new Set(hidden);
  const visibleOrder = order.filter((id) => !hiddenSet.has(id));
  const hiddenOrder = order.filter((id) => hiddenSet.has(id));

  return (
    <div>
      {editing && (
        <div className="mb-3 flex items-center justify-between rounded-md border border-brand-500/30 bg-brand-50 px-3 py-2 text-sm text-brand-700">
          <span>Drag to reorder · tap the eye to hide a panel. Saves automatically.</span>
          {isCustom && (
            <button onClick={reset} className="shrink-0 font-medium text-brand-600 hover:underline">
              Reset to default
            </button>
          )}
        </div>
      )}
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
        <SortableContext items={visibleOrder} strategy={rectSortingStrategy}>
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            {visibleOrder.map((id) => {
              const node = byId.get(id);
              return node ? (
                <SortablePanel key={id} id={id} node={node} editing={editing} onHide={() => hide(id)} />
              ) : null;
            })}
          </div>
        </SortableContext>
      </DndContext>

      {editing && hiddenOrder.length > 0 && (
        <div className="mt-6">
          <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
            Hidden panels
          </div>
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            {hiddenOrder.map((id) => {
              const node = byId.get(id);
              return node ? (
                <div key={id} className="relative rounded-lg ring-1 ring-slate-200">
                  <div className="pointer-events-none select-none opacity-40 grayscale">{node}</div>
                  <div className="absolute inset-0 flex items-center justify-center rounded-lg bg-white/30">
                    <button
                      onClick={() => show(id)}
                      className="rounded-md bg-brand-600 px-3 py-1.5 text-sm font-semibold text-white shadow hover:bg-brand-700"
                    >
                      Show
                    </button>
                  </div>
                </div>
              ) : null;
            })}
          </div>
        </div>
      )}
    </div>
  );
}

function SortablePanel({
  id,
  node,
  editing,
  onHide,
}: {
  id: string;
  node: ReactNode;
  editing: boolean;
  onHide: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id,
    disabled: !editing,
  });
  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 20 : undefined,
    opacity: isDragging ? 0.85 : 1,
  };

  // Outside edit mode: a plain panel, fully interactive, no handles.
  if (!editing) {
    return (
      <div ref={setNodeRef} style={style}>
        {node}
      </div>
    );
  }

  // Edit mode: the whole panel is the drag handle. Its content is locked
  // (pointer-events-none) so links/date pickers don't fire while dragging, and
  // a ring + "Drag" badge make it obvious what's grabbable.
  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      className="relative cursor-grab touch-none rounded-lg ring-2 ring-brand-500/50 active:cursor-grabbing"
    >
      <div className="pointer-events-none absolute left-2 top-2 z-20 inline-flex items-center gap-1 rounded bg-brand-600 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white">
        <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
          <circle cx="8" cy="6" r="1.8" />
          <circle cx="16" cy="6" r="1.8" />
          <circle cx="8" cy="12" r="1.8" />
          <circle cx="16" cy="12" r="1.8" />
          <circle cx="8" cy="18" r="1.8" />
          <circle cx="16" cy="18" r="1.8" />
        </svg>
        Drag
      </div>
      <button
        type="button"
        onClick={onHide}
        onPointerDown={(e) => e.stopPropagation()}
        aria-label="Hide panel"
        title="Hide panel"
        className="pointer-events-auto absolute right-2 top-2 z-20 inline-flex items-center gap-1 rounded bg-white/90 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-600 shadow ring-1 ring-slate-200 hover:bg-white hover:text-red-600"
      >
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 10 8 10 8a13.16 13.16 0 0 1-1.67 2.68M6.61 6.61A13.5 13.5 0 0 0 2 12s3 8 10 8a9.74 9.74 0 0 0 5.39-1.61M1 1l22 22" />
          <path d="M9.88 9.88a3 3 0 1 0 4.24 4.24" />
        </svg>
        Hide
      </button>
      <div className="pointer-events-none select-none">{node}</div>
    </div>
  );
}
