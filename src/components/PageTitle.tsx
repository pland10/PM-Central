"use client";

import { usePathname } from "next/navigation";
import { pageTitleFor, type PageLink } from "@/lib/header";

// The "/ Dashboard" part of the top bar, following the current page.
export function PageTitle({ pages }: { pages: PageLink[] }) {
  const title = pageTitleFor(usePathname() ?? "/", pages);
  if (!title) return null;
  return (
    <>
      <span className="text-white/30" aria-hidden="true">
        /
      </span>
      <span className="truncate text-[15px] text-slate-300">{title}</span>
    </>
  );
}
