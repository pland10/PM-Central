import type { Metadata } from "next";
import "./globals.css";
import { BRAND, brandCssVars } from "@/config/brand";
import { APP_ENV, IS_PRODUCTION } from "@/config/environment";

// Non-prod deployments get an env suffix in the browser-tab title so prod and
// dev tabs are easy to tell apart. Prod stays plain "PMI Lighthouse".
const ENV_TITLE_SUFFIX = IS_PRODUCTION ? "" : APP_ENV === "staging" ? " - Staging" : " - Dev";
const BASE_TITLE = `${BRAND.name}${ENV_TITLE_SUFFIX}`;

export const metadata: Metadata = {
  // default: pages without their own title. template: "%s · PMI Lighthouse - Dev".
  title: { default: BASE_TITLE, template: `%s · ${BASE_TITLE}` },
  description: `${BRAND.name} — ${BRAND.tagline}`,
};

// Root layout: just the document shell + brand colors. The app chrome (sidebar,
// header) lives in the (app) route group so that standalone pages like /login
// render without it.
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <style dangerouslySetInnerHTML={{ __html: brandCssVars() }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
