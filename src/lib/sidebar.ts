// Cookie that remembers whether the desktop sidebar is collapsed. Lives outside
// the "use client" component so the server layout can import the plain string
// (exports of a client module arrive on the server as client references).
export const SIDEBAR_COOKIE = "pmc_sidebar";
