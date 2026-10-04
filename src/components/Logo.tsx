"use client";

import { useState } from "react";
import { BRAND } from "@/config/brand";

// Shows the brand logo image from the brand config. Pass `dark` on dark surfaces
// (e.g. the sidebar) to use the reversed/white logo (BRAND.logoSrcDark); light
// surfaces (e.g. the login card) use BRAND.logoSrc. If the right variant isn't
// set or fails to load, it falls back to the colored initials tile — so a dark
// surface never shows the black logo (which would be invisible).
export function Logo({
  className = "h-11 w-auto max-w-[180px] object-contain",
  fallbackClassName = "h-11 w-11 text-sm",
  dark = false,
}: {
  className?: string;
  fallbackClassName?: string;
  dark?: boolean;
}) {
  const [failed, setFailed] = useState(false);

  const src = dark ? BRAND.logoSrcDark : BRAND.logoSrc;

  if (src && !failed) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={src}
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
