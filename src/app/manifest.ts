import type { MetadataRoute } from "next";
import { BRAND } from "@/config/brand";
import { PM_CENTRAL_NAME } from "@/components/PmCentralMark";
import { APP_ENV, IS_PRODUCTION } from "@/config/environment";

// Web app manifest (served at /manifest.webmanifest and linked automatically).
// Lets Chrome/Edge "Install app" with a real icon. The installed app is the
// product (PM Central, with its Swirl mark — see PmCentralMark); the company
// using it (BRAND) shows inside the app. Non-prod names get an env suffix so an
// installed dev app is easy to tell apart.
const suffix = IS_PRODUCTION ? "" : APP_ENV === "staging" ? " - Staging" : " - Dev";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: `${PM_CENTRAL_NAME}${suffix}`,
    short_name: `${PM_CENTRAL_NAME}${suffix}`,
    description: `${PM_CENTRAL_NAME} for ${BRAND.name}`,
    start_url: "/",
    display: "standalone",
    background_color: BRAND.colors.ink,
    theme_color: BRAND.colors.ink,
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
