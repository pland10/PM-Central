import type { Metadata } from "next";
import "./globals.css";
import { BRAND, brandCssVars } from "@/config/brand";

export const metadata: Metadata = {
  title: BRAND.name,
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
