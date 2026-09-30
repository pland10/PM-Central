// Sibling apps embedded (via iframe) inside PM-Central. Each defaults to PMI's
// deployed URL; override with the matching env var for another deployment.
// Note: these are read server-side, so the pages that use them stay server
// components.
export const INSPECTIONS_URL =
  process.env.INSPECTIONS_URL || "https://pmilighthouse.app/inspections.html";

// Note: Invoicing is now a native, read-only view inside PM-Central (see
// src/app/invoicing and src/lib/invoicing-supabase.ts) rather than an embedded
// iframe, so there is no INVOICING_URL here anymore.
