"use client";

import { useState } from "react";
import { BRAND } from "@/config/brand";

// Shows the brand logo image from /public/pmi-logo.png (or .svg). Until that
// file exists it falls back to the colored initials tile, so the sidebar never
// shows a broken image. Drop your logo at public/pmi-logo.png to use it.
export function Logo() {
  const [failed, setFailed] = useState(false);

  if (!failed) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src="/pmi-logo.png"
        alt={BRAND.name}
        className="h-8 w-auto max-w-[150px] object-contain"
        onError={() => setFailed(true)}
      />
    );
  }

  return (
    <div
      className="flex h-8 w-8 items-center justify-center rounded-md text-xs font-bold text-white"
      style={{ backgroundColor: BRAND.colors.primary }}
    >
      {BRAND.shortName}
    </div>
  );
}
