"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";

// Per-column filter config. Opt-in: a column only gets a filter control if it
// declares one. The control lives in a popover behind a funnel icon in the
// header (so the header row stays clean — no extra input boxes).
//   text   → "contains" box
//   select → option list (searchable when long)
//   date   → From / To range (value returns an ISO date string, or null)
//   number → Min / Max range
export type ColumnFilter<T> = {
  type: "text" | "select" | "date" | "number";
  value: (row: T) => string | number | null;
  options?: { value: string; label: string }[]; // select only; defaults to distinct values
};

export type Column<T> = {
  key: string;
  header: string;
  align?: "left" | "right";
  sortable?: boolean;
  sortValue?: (row: T) => string | number;
  render: (row: T) => ReactNode;
  filter?: ColumnFilter<T>;
};

export type Facet<T> = {
  key: string;
  label: string;
  options: { value: string; label: string }[];
  match: (row: T, value: string) => boolean;
};

type SortKey = { key: string; dir: "asc" | "desc" };
type FilterVal = { q?: string; sel?: string; from?: string; to?: string; min?: string; max?: string };
type OpenFilter = { key: string; x: number; y: number };

function filterActive(type: ColumnFilter<unknown>["type"], v?: FilterVal): boolean {
  if (!v) return false;
  switch (type) {
    case "text":
      return !!v.q && v.q.trim() !== "";
    case "select":
      return !!v.sel;
    case "date":
      return !!(v.from || v.to);
    case "number":
      return (v.min ?? "") !== "" || (v.max ?? "") !== "";
  }
}

function FunnelIcon({ active }: { active: boolean }) {
  return (
    <svg
      viewBox="0 0 16 16"
      className={`h-3 w-3 ${active ? "text-brand-600" : "text-slate-300"}`}
      fill="currentColor"
      aria-hidden
    >
      <path d="M1.5 2.5h13a.5.5 0 0 1 .4.8L10 9.2V13a.5.5 0 0 1-.3.46l-3 1.2A.5.5 0 0 1 6 14.2V9.2L1.1 3.3a.5.5 0 0 1 .4-.8Z" />
    </svg>
  );
}

// Generic client-side table: text search, dropdown facet filters, per-column
// filters (in a popover), and click-to-sort headers (shift-click adds a
// secondary sort). Used by every list page so they behave the same.
export function DataTable<T>({
  rows,
  columns,
  rowKey,
  search,
  searchPlaceholder = "Search…",
  facets,
  initialSort,
  initialFacets,
}: {
  rows: T[];
  columns: Column<T>[];
  rowKey: (row: T) => string;
  search?: (row: T) => string;
  searchPlaceholder?: string;
  facets?: Facet<T>[];
  initialSort?: { key: string; dir: "asc" | "desc" };
  initialFacets?: Record<string, string>;
}) {
  const [q, setQ] = useState("");
  const [facetValues, setFacetValues] = useState<Record<string, string>>(initialFacets ?? {});
  const [colFilters, setColFilters] = useState<Record<string, FilterVal>>({});
  const [sort, setSort] = useState<SortKey[]>(initialSort ? [initialSort] : []);
  const [open, setOpen] = useState<OpenFilter | null>(null);
  const [optSearch, setOptSearch] = useState("");
  const popRef = useRef<HTMLDivElement>(null);

  // Close the popover on outside click, Escape, or scroll (it's fixed-position).
  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      if (popRef.current && !popRef.current.contains(e.target as Node)) setOpen(null);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(null);
    }
    function onScroll() {
      setOpen(null);
    }
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    window.addEventListener("scroll", onScroll, true);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("scroll", onScroll, true);
    };
  }, [open]);

  // Distinct options for each select-filter column (unless supplied + ordered).
  const colOptions = useMemo(() => {
    const m: Record<string, { value: string; label: string }[]> = {};
    for (const c of columns) {
      if (c.filter?.type !== "select") continue;
      if (c.filter.options) {
        m[c.key] = c.filter.options;
      } else {
        const get = c.filter.value;
        const vals = Array.from(
          new Set(rows.map((r) => String(get(r) ?? "")).filter(Boolean))
        ).sort();
        m[c.key] = vals.map((v) => ({ value: v, label: v }));
      }
    }
    return m;
  }, [columns, rows]);

  const filtered = useMemo(() => {
    let r = rows;

    if (q.trim() && search) {
      const needle = q.trim().toLowerCase();
      r = r.filter((row) => search(row).toLowerCase().includes(needle));
    }

    if (facets) {
      for (const f of facets) {
        const v = facetValues[f.key];
        if (v) r = r.filter((row) => f.match(row, v));
      }
    }

    for (const c of columns) {
      if (!c.filter) continue;
      const v = colFilters[c.key];
      if (!filterActive(c.filter.type, v)) continue;
      const get = c.filter.value;
      if (c.filter.type === "text") {
        const needle = v.q!.toLowerCase();
        r = r.filter((row) => String(get(row) ?? "").toLowerCase().includes(needle));
      } else if (c.filter.type === "select") {
        r = r.filter((row) => String(get(row) ?? "") === v.sel);
      } else if (c.filter.type === "date") {
        r = r.filter((row) => {
          const raw = get(row);
          if (!raw) return false;
          const d = String(raw).slice(0, 10);
          if (v.from && d < v.from) return false;
          if (v.to && d > v.to) return false;
          return true;
        });
      } else {
        r = r.filter((row) => {
          const num = Number(get(row) ?? 0);
          if ((v.min ?? "") !== "" && num < Number(v.min)) return false;
          if ((v.max ?? "") !== "" && num > Number(v.max)) return false;
          return true;
        });
      }
    }

    if (sort.length) {
      r = [...r].sort((a, b) => {
        for (const s of sort) {
          const col = columns.find((c) => c.key === s.key);
          if (!col?.sortValue) continue;
          const av = col.sortValue(a);
          const bv = col.sortValue(b);
          if (av < bv) return s.dir === "asc" ? -1 : 1;
          if (av > bv) return s.dir === "asc" ? 1 : -1;
        }
        return 0;
      });
    }

    return r;
  }, [rows, q, facetValues, colFilters, sort, columns, search, facets]);

  // Single click: sort by this column alone (asc → desc → off). Shift-click:
  // add/cycle this column as an additional sort key (asc → desc → remove).
  function toggleSort(key: string, additive: boolean) {
    setSort((prev) => {
      const existing = prev.find((s) => s.key === key);
      if (additive) {
        if (!existing) return [...prev, { key, dir: "asc" }];
        if (existing.dir === "asc") return prev.map((s) => (s.key === key ? { key, dir: "desc" } : s));
        return prev.filter((s) => s.key !== key);
      }
      if (!existing || prev.length > 1) return [{ key, dir: "asc" }];
      if (existing.dir === "asc") return [{ key, dir: "desc" }];
      return [];
    });
  }

  function openPopover(key: string, el: HTMLElement) {
    const rect = el.getBoundingClientRect();
    const x = Math.min(rect.left, window.innerWidth - 248);
    setOptSearch("");
    setOpen({ key, x: Math.max(8, x), y: rect.bottom + 4 });
  }

  function setFilter(key: string, patch: FilterVal) {
    setColFilters((v) => ({ ...v, [key]: { ...v[key], ...patch } }));
  }

  function clearFilter(key: string) {
    setColFilters((v) => {
      const next = { ...v };
      delete next[key];
      return next;
    });
  }

  const filtersActive =
    q.trim() !== "" ||
    Object.values(facetValues).some(Boolean) ||
    columns.some((c) => c.filter && filterActive(c.filter.type, colFilters[c.key]));

  function clearAll() {
    setQ("");
    setFacetValues({});
    setColFilters({});
    setOpen(null);
  }

  const openCol = open ? columns.find((c) => c.key === open.key) : null;

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        {search && (
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={searchPlaceholder}
            className="w-64 rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm outline-none focus:border-brand-500"
          />
        )}
        {facets?.map((f) => (
          <select
            key={f.key}
            value={facetValues[f.key] ?? ""}
            onChange={(e) => setFacetValues((v) => ({ ...v, [f.key]: e.target.value }))}
            className="rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm outline-none focus:border-brand-500"
          >
            <option value="">{f.label}: All</option>
            {f.options.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        ))}
        {filtersActive && (
          <button
            onClick={clearAll}
            className="rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm text-slate-500 hover:text-slate-700"
          >
            Clear
          </button>
        )}
        <span className="ml-auto text-xs text-slate-500">
          {filtered.length} of {rows.length}
        </span>
      </div>

      <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
              {columns.map((c) => {
                const idx = sort.findIndex((s) => s.key === c.key);
                const active = idx !== -1;
                const fActive = !!c.filter && filterActive(c.filter.type, colFilters[c.key]);
                return (
                  <th
                    key={c.key}
                    className={[
                      "px-4 py-3 font-medium",
                      c.align === "right" ? "text-right" : "",
                    ].join(" ")}
                  >
                    <span className={`inline-flex items-center gap-1 ${c.align === "right" ? "flex-row-reverse" : ""}`}>
                      <span
                        onClick={c.sortable ? (e) => toggleSort(c.key, e.shiftKey) : undefined}
                        className={c.sortable ? "cursor-pointer select-none hover:text-slate-700" : ""}
                      >
                        {c.header}
                        {c.sortable && (
                          <span className="ml-1 text-slate-400">
                            {active ? (sort[idx].dir === "asc" ? "↑" : "↓") : "↕"}
                            {active && sort.length > 1 && (
                              <span className="ml-0.5 text-[9px] align-super">{idx + 1}</span>
                            )}
                          </span>
                        )}
                      </span>
                      {c.filter && (
                        <button
                          type="button"
                          onClick={(e) => openPopover(c.key, e.currentTarget)}
                          className="rounded p-0.5 hover:bg-slate-200"
                          title="Filter"
                        >
                          <FunnelIcon active={fActive} />
                        </button>
                      )}
                    </span>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && (
              <tr>
                <td colSpan={columns.length} className="px-4 py-10 text-center text-slate-400">
                  No results.
                </td>
              </tr>
            )}
            {filtered.map((row) => (
              <tr
                key={rowKey(row)}
                className="border-b border-slate-100 last:border-0 hover:bg-slate-50"
              >
                {columns.map((c) => (
                  <td key={c.key} className={`px-4 py-3 ${c.align === "right" ? "text-right" : ""}`}>
                    {c.render(row)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {open && openCol?.filter && (
        <div
          ref={popRef}
          style={{ position: "fixed", left: open.x, top: open.y, width: 240 }}
          className="z-50 rounded-lg border border-slate-200 bg-white p-2 text-sm shadow-lg"
        >
          <div className="mb-1 flex items-center justify-between px-1">
            <span className="text-xs font-medium normal-case text-slate-500">{openCol.header}</span>
            {filterActive(openCol.filter.type, colFilters[open.key]) && (
              <button
                onClick={() => clearFilter(open.key)}
                className="text-xs text-brand-600 hover:underline"
              >
                Clear
              </button>
            )}
          </div>

          {openCol.filter.type === "text" && (
            <input
              autoFocus
              value={colFilters[open.key]?.q ?? ""}
              onChange={(e) => setFilter(open.key, { q: e.target.value })}
              placeholder="Contains…"
              className="w-full rounded border border-slate-300 bg-white px-2 py-1 text-sm outline-none focus:border-brand-500"
            />
          )}

          {openCol.filter.type === "select" &&
            (() => {
              const opts = colOptions[open.key] ?? [];
              const showSearch = opts.length > 8;
              const shown = showSearch
                ? opts.filter((o) => o.label.toLowerCase().includes(optSearch.toLowerCase()))
                : opts;
              const sel = colFilters[open.key]?.sel;
              return (
                <div>
                  {showSearch && (
                    <input
                      autoFocus
                      value={optSearch}
                      onChange={(e) => setOptSearch(e.target.value)}
                      placeholder="Find…"
                      className="mb-1 w-full rounded border border-slate-300 bg-white px-2 py-1 text-xs outline-none focus:border-brand-500"
                    />
                  )}
                  <div className="max-h-56 overflow-auto">
                    <button
                      onClick={() => {
                        clearFilter(open.key);
                        setOpen(null);
                      }}
                      className={`block w-full rounded px-2 py-1 text-left hover:bg-slate-100 ${!sel ? "font-medium text-brand-700" : "text-slate-600"}`}
                    >
                      All
                    </button>
                    {shown.map((o) => (
                      <button
                        key={o.value}
                        onClick={() => {
                          setFilter(open.key, { sel: o.value });
                          setOpen(null);
                        }}
                        className={`block w-full truncate rounded px-2 py-1 text-left hover:bg-slate-100 ${sel === o.value ? "font-medium text-brand-700" : "text-slate-700"}`}
                      >
                        {o.label}
                      </button>
                    ))}
                    {shown.length === 0 && (
                      <div className="px-2 py-1 text-xs text-slate-400">No matches.</div>
                    )}
                  </div>
                </div>
              );
            })()}

          {openCol.filter.type === "date" && (
            <div className="flex items-center gap-1">
              <input
                type="date"
                value={colFilters[open.key]?.from ?? ""}
                onChange={(e) => setFilter(open.key, { from: e.target.value })}
                className="w-full rounded border border-slate-300 bg-white px-1.5 py-1 text-xs outline-none focus:border-brand-500"
              />
              <span className="text-xs text-slate-400">to</span>
              <input
                type="date"
                value={colFilters[open.key]?.to ?? ""}
                onChange={(e) => setFilter(open.key, { to: e.target.value })}
                className="w-full rounded border border-slate-300 bg-white px-1.5 py-1 text-xs outline-none focus:border-brand-500"
              />
            </div>
          )}

          {openCol.filter.type === "number" && (
            <div className="flex items-center gap-1">
              <input
                type="number"
                value={colFilters[open.key]?.min ?? ""}
                onChange={(e) => setFilter(open.key, { min: e.target.value })}
                placeholder="Min"
                className="w-full rounded border border-slate-300 bg-white px-2 py-1 text-xs outline-none focus:border-brand-500"
              />
              <span className="text-xs text-slate-400">–</span>
              <input
                type="number"
                value={colFilters[open.key]?.max ?? ""}
                onChange={(e) => setFilter(open.key, { max: e.target.value })}
                placeholder="Max"
                className="w-full rounded border border-slate-300 bg-white px-2 py-1 text-xs outline-none focus:border-brand-500"
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
}
