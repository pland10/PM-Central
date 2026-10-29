"use client";

import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";

// Plaid Link connect flow. Loads Plaid's hosted Link script, asks the server for
// a link_token, opens Link (the secure popup where the user logs into their
// institution), then hands the resulting public_token to /api/plaid/exchange to
// store the linked account. No credentials ever touch our code.

type PlaidMetadata = { institution?: { name?: string; institution_id?: string } | null };
type PlaidHandler = { open: () => void };
interface PlaidFactory {
  create(config: {
    token: string;
    onSuccess: (publicToken: string, metadata: PlaidMetadata) => void;
    onExit?: () => void;
  }): PlaidHandler;
}
declare global {
  interface Window {
    Plaid?: PlaidFactory;
  }
}

const PLAID_SRC = "https://cdn.plaid.com/link/v2/stable/link-initialize.js";

function ensurePlaidScript(): Promise<void> {
  return new Promise((resolve, reject) => {
    if (typeof window === "undefined") return reject(new Error("No window."));
    if (window.Plaid) return resolve();
    const existing = document.querySelector<HTMLScriptElement>(`script[src="${PLAID_SRC}"]`);
    if (existing) {
      existing.addEventListener("load", () => resolve());
      existing.addEventListener("error", () => reject(new Error("Could not load Plaid.")));
      return;
    }
    const s = document.createElement("script");
    s.src = PLAID_SRC;
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error("Could not load Plaid."));
    document.body.appendChild(s);
  });
}

export function ConnectButton({ disabled }: { disabled?: boolean }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const router = useRouter();

  const connect = useCallback(async () => {
    setError("");
    setLoading(true);
    try {
      await ensurePlaidScript();
      const res = await fetch("/api/plaid/link-token", { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Could not start Plaid.");

      const handler = window.Plaid!.create({
        token: data.link_token,
        onSuccess: async (publicToken, metadata) => {
          try {
            const ex = await fetch("/api/plaid/exchange", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ public_token: publicToken, institution: metadata?.institution }),
            });
            if (!ex.ok) {
              const d = await ex.json().catch(() => ({}));
              setError(d?.error || "Could not link the account.");
            } else {
              router.refresh();
            }
          } finally {
            setLoading(false);
          }
        },
        onExit: () => setLoading(false),
      });
      handler.open();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
      setLoading(false);
    }
  }, [router]);

  return (
    <div className="shrink-0 text-right">
      <button
        onClick={connect}
        disabled={disabled || loading}
        className="rounded-md bg-brand-500 px-4 py-2 text-sm font-medium text-white hover:bg-brand-600 disabled:opacity-40"
      >
        {loading ? "Connecting…" : "+ Connect account"}
      </button>
      {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
    </div>
  );
}
