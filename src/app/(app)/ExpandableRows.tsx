"use client";

import { Children, useState, type ReactNode } from "react";

// Shows the first `initial` rows and a toggle to reveal the rest. Rows are
// rendered on the server and passed in as children; this only slices them so a
// long panel (e.g. month-start delinquencies) doesn't take over the page.
export function ExpandableRows({
  children,
  initial = 8,
}: {
  children: ReactNode;
  initial?: number;
}) {
  const items = Children.toArray(children);
  const [expanded, setExpanded] = useState(false);
  const hiddenCount = items.length - initial;
  const shown = expanded ? items : items.slice(0, initial);

  return (
    <>
      {shown}
      {hiddenCount > 0 && (
        <button
          onClick={() => setExpanded((e) => !e)}
          className="mt-2 w-full rounded-md py-1.5 text-xs font-medium text-brand-600 hover:bg-slate-50"
        >
          {expanded ? "Show less" : `Show all ${items.length} →`}
        </button>
      )}
    </>
  );
}
