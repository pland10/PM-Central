"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { createSupabaseBrowserClient } from "@/lib/auth/supabase-browser";

// Signs the user out after `minutes` of no interaction, then sends them to the
// login screen. Rendered only where enabled (non-prod by default — see
// IDLE_LOGOUT_MINUTES). Activity is tracked with a timestamp + a periodic check
// rather than resetting a timer on every event, so it's cheap.
export function IdleLogout({ minutes }: { minutes: number }) {
  const router = useRouter();
  const lastActive = useRef(Date.now());

  useEffect(() => {
    if (!minutes || minutes <= 0) return;
    const limitMs = minutes * 60 * 1000;
    const bump = () => {
      lastActive.current = Date.now();
    };
    const events: (keyof WindowEventMap)[] = [
      "mousemove",
      "mousedown",
      "keydown",
      "touchstart",
      "scroll",
      "wheel",
    ];
    events.forEach((e) => window.addEventListener(e, bump, { passive: true }));

    let done = false;
    const check = window.setInterval(async () => {
      if (done) return;
      if (Date.now() - lastActive.current >= limitMs) {
        done = true;
        try {
          await createSupabaseBrowserClient().auth.signOut();
        } catch {
          // ignore — redirect below still gates via middleware
        }
        router.push("/login?timeout=1");
        router.refresh();
      }
    }, 15000);

    return () => {
      events.forEach((e) => window.removeEventListener(e, bump));
      window.clearInterval(check);
    };
  }, [minutes, router]);

  return null;
}
