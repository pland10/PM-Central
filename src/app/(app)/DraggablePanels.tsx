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

// Drag-to-rearrange dashboard panels. The order is saved to the signed-in
// user's Supabase user_metadata (follows them across devices) and mirrored to
// localStorage (instant, and the fallback when not signed in, e.g. Basic Auth).

export type PanelItem = { id: string; node: ReactNode };

const LS_KEY = "pmi.dashboardOrder";

// Keep only ids that still exist, in saved order, then append any new panels.
function reconcile(saved: string[], ids: string[]): string[] {
  const known = new Set(ids);
  const kept = saved.filter((id) => known.has(id));
  const missing = ids.filter((id) => !kept.includes(id));
  return [...kept, ...missing];
}

export function DraggablePanels({
  items,
  initialOrder,
  canPersist,
}: {
  items: PanelItem[];
  initialOrder: string[] | null;
  canPersist: boolean;
}) {
  const ids = useMemo(() => items.map((i) => i.id), [items]);
  const byId = useMemo(() => new Map(items.map((i) => [i.id, i.node])), [items]);

  // Server-provided order (from the account) avoids a reorder flash; localStorage
  // is applied after mount when the server had none (not signed in).
  const [order, setOrder] = useState<string[]>(() =>
    reconcile(initialOrder ?? [], ids)
  );

  useEffect(() => {
    if (initialOrder && initialOrder.length) return; // account order already applied
    try {
      const raw = localStorage.getItem(LS_KEY);
      if (raw) setOrder(reconcile(JSON.parse(raw) as string[], ids));
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

  function save(next: string[]) {
    try {
      localStorage.setItem(LS_KEY, JSON.stringify(next));
    } catch {
      /* ignore */
    }
    if (!canPersist) return;
    try {
      createSupabaseBrowserClient()
        .auth.updateUser({ data: { dashboard_order: next } })
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
      save(next);
      return next;
    });
  }

  const isCustom = order.join("|") !== ids.join("|");
  function reset() {
    try {
      localStorage.removeItem(LS_KEY);
    } catch {
      /* ignore */
    }
    if (canPersist) {
      try {
        createSupabaseBrowserClient()
          .auth.updateUser({ data: { dashboard_order: null } })
          .catch(() => {});
      } catch {
        /* ignore */
      }
    }
    setOrder(ids);
  }

  return (
    <div>
      <div className="mb-1 flex h-4 items-center justify-end">
        {isCustom && (
          <button onClick={reset} className="text-xs text-slate-400 hover:text-brand-600">
            Reset layout
          </button>
        )}
      </div>
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
        <SortableContext items={order} strategy={rectSortingStrategy}>
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            {order.map((id) => {
              const node = byId.get(id);
              return node ? <SortablePanel key={id} id={id} node={node} /> : null;
            })}
          </div>
        </SortableContext>
      </DndContext>
    </div>
  );
}

function SortablePanel({ id, node }: { id: string; node: ReactNode }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 20 : undefined,
    opacity: isDragging ? 0.85 : 1,
  };
  return (
    <div ref={setNodeRef} style={style} className="group relative">
      <button
        {...attributes}
        {...listeners}
        aria-label="Drag to reorder"
        title="Drag to reorder"
        className="absolute right-1.5 top-1.5 z-10 cursor-grab touch-none rounded p-1 text-slate-300 opacity-40 transition hover:bg-slate-100 hover:text-slate-500 group-hover:opacity-100 active:cursor-grabbing"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
          <circle cx="9" cy="6" r="1.6" />
          <circle cx="15" cy="6" r="1.6" />
          <circle cx="9" cy="12" r="1.6" />
          <circle cx="15" cy="12" r="1.6" />
          <circle cx="9" cy="18" r="1.6" />
          <circle cx="15" cy="18" r="1.6" />
        </svg>
      </button>
      {node}
    </div>
  );
}
