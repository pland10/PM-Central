"use client";

import { useMemo, useState, type ReactNode } from "react";

// Per-column filter config. Opt-in: a column only gets a filter control if it
// declares one, so pages that don't set `filter` render exactly as before.
export type ColumnFilter<T> = {
  type: "text" | "select";
  value: (row: T) => string; // the value to filter on
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

// Generic client-side table: text search, dropdown facet filters, optional
// per-column filters, and click-to-sort headers (shift-click adds a secondary
// sort). Used by every list page so they behave the same.
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
  const [colFilters, setColFilters] = useState<Record<string, string>>({});
  const [sort, setSort] = useState<SortKey[]>(initialSort ? [initialSort] : []);

  const hasColFilters = columns.some((c) => c.filter);

  // Distinct options for each select-filter column (unless the column supplies
  // its own ordered options). Empty values are dropped.
  const colOptions = useMemo(() => {
    const m: Record<string, { value: string; label: string }[]> = {};
    for (const c of columns) {
      if (c.filter?.type !== "select") continue;
      if (c.filter.options) {
        m[c.key] = c.filter.options;
      } else {
        const get = c.filter.value;
        const vals = Array.from(new Set(rows.map((r) => get(r)).filter(Boolean))).sort();
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
      const fv = colFilters[c.key];
      if (!fv || !c.filter) continue;
      const get = c.filter.value;
      if (c.filter.type === "text") {
        const needle = fv.toLowerCase();
        r = r.filter((row) => get(row).toLowerCase().includes(needle));
      } else {
        r = r.filter((row) => get(row) === fv);
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

  const filtersActive =
    q.trim() !== "" ||
    Object.values(facetValues).some(Boolean) ||
    Object.values(colFilters).some(Boolean);

  function clearAll() {
    setQ("");
    setFacetValues({});
    setColFilters({});
  }

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
                return (
                  <th
                    key={c.key}
                    onClick={c.sortable ? (e) => toggleSort(c.key, e.shiftKey) : undefined}
                    className={[
                      "px-4 py-3 font-medium",
                      c.align === "right" ? "text-right" : "",
                      c.sortable ? "cursor-pointer select-none hover:text-slate-700" : "",
                    ].join(" ")}
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
                  </th>
                );
              })}
            </tr>
            {hasColFilters && (
              <tr className="border-b border-slate-200 bg-white">
                {columns.map((c) => (
                  <th key={c.key} className="px-2 py-2 font-normal">
                    {c.filter?.type === "text" && (
                      <input
                        value={colFilters[c.key] ?? ""}
                        onChange={(e) =>
                          setColFilters((v) => ({ ...v, [c.key]: e.target.value }))
                        }
                        placeholder="Filter…"
                        className="w-full rounded border border-slate-200 bg-white px-2 py-1 text-xs font-normal normal-case tracking-normal text-slate-700 outline-none focus:border-brand-500"
                      />
                    )}
                    {c.filter?.type === "select" && (
                      <select
                        value={colFilters[c.key] ?? ""}
                        onChange={(e) =>
                          setColFilters((v) => ({ ...v, [c.key]: e.target.value }))
                        }
                        className="w-full rounded border border-slate-200 bg-white px-1.5 py-1 text-xs font-normal normal-case tracking-normal text-slate-700 outline-none focus:border-brand-500"
                      >
                        <option value="">All</option>
                        {(colOptions[c.key] ?? []).map((o) => (
                          <option key={o.value} value={o.value}>
                            {o.label}
                          </option>
                        ))}
                      </select>
                    )}
                  </th>
                ))}
              </tr>
            )}
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
    </div>
  );
}
