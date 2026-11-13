"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createSupabaseBrowserClient } from "@/lib/auth/supabase-browser";

export function SignOutButton({ dark = false }: { dark?: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function signOut() {
    setBusy(true);
    try {
      await createSupabaseBrowserClient().auth.signOut();
    } catch {
      // ignore — we redirect to /login regardless
    }
    router.push("/login");
    router.refresh();
  }

  return (
    <button
      onClick={signOut}
      disabled={busy}
      className={`rounded-md border px-3 py-1.5 text-xs font-medium transition-colors disabled:opacity-50 ${
        dark
          ? "border-white/20 text-slate-200 hover:bg-white/10 hover:text-white"
          : "border-slate-300 text-slate-600 hover:bg-slate-50"
      }`}
    >
      {busy ? "Signing out…" : "Sign out"}
    </button>
  );
}
