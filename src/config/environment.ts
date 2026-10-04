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

// Label + color for the top-bar environment indicator. Production renders the
// normal white bar (no label); everything else gets a loud red bar.
export const ENV_INDICATOR: { label: string; bg: string; fg: string } | null =
  IS_PRODUCTION
    ? null
    : {
        label: APP_ENV === "staging" ? "STAGING" : "DEVELOPMENT",
        bg: "#B91C1C", // red-700
        fg: "#FFFFFF",
      };
