"use client";

import { useState } from "react";
import { BRAND } from "@/config/brand";

// Shows the brand logo image from BRAND.logoSrc (a file in /public). Until that
// file exists it falls back to the colored initials tile, so the sidebar never
// shows a broken image. Set the path in src/config/brand.ts and drop the file
// in /public to use it.
export function Logo() {
  const [failed, setFailed] = useState(false);

  if (BRAND.logoSrc && !failed) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={BRAND.logoSrc}
        alt={BRAND.name}
        className="h-11 w-auto max-w-[180px] object-contain"
        onError={() => setFailed(true)}
      />
    );
  }

  return (
    <div
      className="flex h-11 w-11 items-center justify-center rounded-md text-sm font-bold text-white"
      style={{ backgroundColor: BRAND.colors.primary }}
    >
      {BRAND.shortName}
    </div>
  );
}
