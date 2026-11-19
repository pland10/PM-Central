"use client";

import { useState, type ReactNode } from "react";
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

export type OrderItem = { id: string; label: string; address: string };

export function PropertyOrderManager({
  initialRentals,
  initialSquatter,
}: {
  initialRentals: OrderItem[];
  initialSquatter: OrderItem[];
}) {
  const [rentals, setRentals] = useState(initialRentals);
  const [squatter, setSquatter] = useState(initialSquatter);
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 180, tolerance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  async function save(nextRentals: OrderItem[], nextSquatter: OrderItem[]) {
    setStatus("saving");
    try {
      const ids = [...nextRentals, ...nextSquatter].map((x) => x.id);
      const res = await fetch("/api/admin/property-order", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids }),
      });
      setStatus(res.ok ? "saved" : "error");
    } catch {
      setStatus("error");
    }
  }

  const onDragEnd =
    (list: OrderItem[], setList: (v: OrderItem[]) => void, other: OrderItem[], isRental: boolean) => (e: DragEndEvent) => {
      const { active, over } = e;
      if (!over || active.id === over.id) return;
      const from = list.findIndex((x) => x.id === active.id);
      const to = list.findIndex((x) => x.id === over.id);
      if (from < 0 || to < 0) return;
      const next = arrayMove(list, from, to);
      setList(next);
      save(isRental ? next : other, isRental ? other : next);
    };

  const listBlock = (
    title: string,
    list: OrderItem[],
    setList: (v: OrderItem[]) => void,
    other: OrderItem[],
    isRental: boolean
  ) => (
    <section className="mt-4 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <h2 className="text-sm font-semibold text-slate-900">
        {title} <span className="font-normal text-slate-400">({list.length})</span>
      </h2>
      {list.length === 0 ? (
        <p className="mt-2 text-xs text-slate-400">No houses here.</p>
      ) : (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd(list, setList, other, isRental)}>
          <SortableContext items={list.map((x) => x.id)} strategy={verticalListSortingStrategy}>
            <ul className="mt-2 space-y-1">
              {list.map((it) => (
                <SortableRow key={it.id} id={it.id} label={it.label}>
                  <span className="text-sm font-medium text-slate-800">{it.label}</span>
                  <span className="text-xs text-slate-400">{it.address}</span>
                </SortableRow>
              ))}
            </ul>
          </SortableContext>
        </DndContext>
      )}
    </section>
  );

  return (
    <div>
      <div className="flex items-center justify-between rounded-xl border border-slate-200 bg-white p-3 text-sm shadow-sm">
        <span className="text-slate-600">Drag the handle to set the order you walk the houses on Monday. Saves automatically.</span>
        <span className={status === "error" ? "text-red-600" : "text-slate-400"}>
          {status === "saving" ? "Saving…" : status === "saved" ? "Saved" : status === "error" ? "Couldn't save" : ""}
        </span>
      </div>
      {listBlock("Rental Units", rentals, setRentals, squatter, true)}
      {listBlock("Squatter Watch", squatter, setSquatter, rentals, false)}
    </div>
  );
}

function SortableRow({ id, label, children }: { id: string; label: string; children: ReactNode }) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({ id });
  const style: React.CSSProperties = {
    transform: CSS.Translate.toString(transform),
    transition,
    opacity: isDragging ? 0.85 : 1,
    zIndex: isDragging ? 20 : undefined,
    position: "relative",
  };
  return (
    <li ref={setNodeRef} style={style} className="flex items-center gap-3 rounded-lg border border-slate-100 bg-white px-2 py-1.5">
      <button
        type="button"
        ref={setActivatorNodeRef}
        {...attributes}
        {...listeners}
        aria-label={`Drag to reorder ${label}`}
        title="Drag to reorder"
        className="inline-flex cursor-grab touch-none items-center rounded bg-slate-100 p-1 text-slate-500 hover:bg-slate-200 active:cursor-grabbing"
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
      <div className="flex flex-1 flex-wrap items-baseline gap-x-2">{children}</div>
    </li>
  );
}
