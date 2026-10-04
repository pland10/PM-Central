// Runtime environment (prod vs. non-prod). Drives the red banner on the top bar
// so nobody mistakes dev/staging for production — important now that prod and
// dev run against separate databases.
//
// Set APP_ENV per deployment: "production" | "staging" | "development".
// SAFETY DEFAULT: anything other than "production" (including unset) is treated
// as non-prod and shows the red banner, so prod must be opted into explicitly.
export type AppEnv = "production" | "staging" | "development";

export const APP_ENV: AppEnv = (() => {
  const v = (process.env.APP_ENV ?? "").trim().toLowerCase();
  if (v === "production" || v === "prod") return "production";
  if (v === "staging" || v === "stage") return "staging";
  return "development";
})();

export const IS_PRODUCTION = APP_ENV === "production";

// Label + color for the environment indicator (top bar + login banner).
// Production renders the normal white bar (no label); everything else gets a
// loud red bar.
export const ENV_INDICATOR: { label: string; bg: string; fg: string } | null =
  IS_PRODUCTION
    ? null
    : {
        label: APP_ENV === "staging" ? "STAGING" : "DEVELOPMENT",
        bg: "#B91C1C", // red-700
        fg: "#FFFFFF",
      };

// Idle auto-logout (minutes). 0 disables it. Default: 15 min on non-prod, off on
// prod — so a forgotten dev session doesn't stay open against shared data.
// Override per deployment with SESSION_IDLE_MINUTES (e.g. enable it on prod too).
export const IDLE_LOGOUT_MINUTES: number = (() => {
  const raw = process.env.SESSION_IDLE_MINUTES;
  if (raw != null && raw.trim() !== "") {
    const n = parseInt(raw.trim(), 10);
    return Number.isFinite(n) && n > 0 ? n : 0;
  }
  return IS_PRODUCTION ? 0 : 15;
})();
