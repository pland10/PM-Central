"use client";

import { useMemo, useState, type ReactNode } from "react";

export type Column<T> = {
  key: string;
  header: string;
  align?: "left" | "right";
  sortable?: boolean;
  sortValue?: (row: T) => string | number;
  render: (row: T) => ReactNode;
};

export type Facet<T> = {
  key: string;
  label: string;
  options: { value: string; label: string }[];
  match: (row: T, value: string) => boolean;
};

type SortState = { key: string; dir: "asc" | "desc" } | null;

// Generic client-side table: text search, dropdown facet filters, and
// click-to-sort column headers. Used by every list page so they behave the same.
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
  const [sort, setSort] = useState<SortState>(initialSort ?? null);

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

    if (sort) {
      const col = columns.find((c) => c.key === sort.key);
      if (col?.sortValue) {
        const sv = col.sortValue;
        r = [...r].sort((a, b) => {
          const av = sv(a);
          const bv = sv(b);
          if (av < bv) return sort.dir === "asc" ? -1 : 1;
          if (av > bv) return sort.dir === "asc" ? 1 : -1;
          return 0;
        });
      }
    }

    return r;
  }, [rows, q, facetValues, sort, columns, search, facets]);

  function toggleSort(key: string) {
    setSort((s) =>
      s && s.key === key
        ? { key, dir: s.dir === "asc" ? "desc" : "asc" }
        : { key, dir: "asc" }
    );
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
            onChange={(e) =>
              setFacetValues((v) => ({ ...v, [f.key]: e.target.value }))
            }
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
        <span className="ml-auto text-xs text-slate-500">
          {filtered.length} of {rows.length}
        </span>
      </div>

      <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
              {columns.map((c) => {
                const active = sort?.key === c.key;
                return (
                  <th
                    key={c.key}
                    onClick={c.sortable ? () => toggleSort(c.key) : undefined}
                    className={[
                      "px-4 py-3 font-medium",
                      c.align === "right" ? "text-right" : "",
                      c.sortable ? "cursor-pointer select-none hover:text-slate-700" : "",
                    ].join(" ")}
                  >
                    {c.header}
                    {c.sortable && (
                      <span className="ml-1 text-slate-400">
                        {active ? (sort!.dir === "asc" ? "↑" : "↓") : "↕"}
                      </span>
                    )}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && (
              <tr>
                <td
                  colSpan={columns.length}
                  className="px-4 py-10 text-center text-slate-400"
                >
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
                  <td
                    key={c.key}
                    className={`px-4 py-3 ${c.align === "right" ? "text-right" : ""}`}
                  >
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
