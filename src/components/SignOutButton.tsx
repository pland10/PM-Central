"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createSupabaseBrowserClient } from "@/lib/auth/supabase-browser";

export function SignOutButton() {
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
      className="rounded-md border border-slate-300 px-2.5 py-1 text-xs font-medium text-slate-600 transition-colors hover:bg-slate-50 disabled:opacity-50"
    >
      {busy ? "Signing out…" : "Sign out"}
    </button>
  );
}
