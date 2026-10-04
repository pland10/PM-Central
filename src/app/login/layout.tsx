import { ENV_INDICATOR } from "@/config/environment";

// Render at request time, not build time: APP_ENV is a runtime var (not a build
// arg), so static prerendering would bake in the wrong environment banner.
export const dynamic = "force-dynamic";

// Wraps the login page. On non-prod it shows a fixed red banner at the top so
// you always know which environment you're signing into. Server component, so
// APP_ENV is read server-side (prod stays clean, no banner).
export default function LoginLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      {ENV_INDICATOR && (
        <div
          className="fixed inset-x-0 top-0 z-50 flex items-center justify-center gap-2 py-2 text-xs font-bold uppercase tracking-wider"
          style={{ backgroundColor: ENV_INDICATOR.bg, color: ENV_INDICATOR.fg }}
        >
          {ENV_INDICATOR.label} — not production
        </div>
      )}
      {children}
    </>
  );
}
