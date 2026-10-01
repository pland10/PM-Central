"use client";

import { useState } from "react";
import { BRAND } from "@/config/brand";

// Shows the brand logo image from BRAND.logoSrc (a file in /public). Until that
// file exists it falls back to the colored initials tile, so the sidebar never
// shows a broken image. Set the path in src/config/brand.ts and drop the file
// in /public to use it.
export function Logo({
  className = "h-11 w-auto max-w-[180px] object-contain",
  fallbackClassName = "h-11 w-11 text-sm",
}: {
  className?: string;
  fallbackClassName?: string;
}) {
  const [failed, setFailed] = useState(false);

  if (BRAND.logoSrc && !failed) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={BRAND.logoSrc}
        alt={BRAND.name}
        className={className}
        onError={() => setFailed(true)}
      />
    );
  }

  return (
    <div
      className={`flex items-center justify-center rounded-md font-bold text-white ${fallbackClassName}`}
      style={{ backgroundColor: BRAND.colors.primary }}
    >
      {BRAND.shortName}
    </div>
  );
}
