// Sibling apps embedded (via iframe) inside PM-Central. Each defaults to PMI's
// deployed URL; override with the matching env var for another deployment.
// Note: these are read server-side, so the pages that use them stay server
// components.
export const INSPECTIONS_URL =
  process.env.INSPECTIONS_URL || "https://pmilighthouse.app/inspections.html";

export const INVOICING_URL =
  process.env.INVOICING_URL || "https://invoicing.pmilighthouse.app/";

export const SEARCH_URL =
  process.env.SEARCH_URL || "https://pmilighthouse.app/search.html";
