"use client";

import { useEffect, useState } from "react";

// VAPID public key (URL-safe base64) → Uint8Array for pushManager.subscribe.
function urlBase64ToUint8Array(base64String: string): Uint8Array<ArrayBuffer> {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  const out = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

const isStandalone = () =>
  typeof window !== "undefined" &&
  (window.matchMedia("(display-mode: standalone)").matches ||
    (navigator as unknown as { standalone?: boolean }).standalone === true);

type Status = "checking" | "needs-install" | "unsupported" | "denied" | "idle" | "working" | "enabled";

export function PushSettings() {
  const [status, setStatus] = useState<Status>("checking");
  const [msg, setMsg] = useState("");
  const [error, setError] = useState("");
  const [testing, setTesting] = useState(false);

  useEffect(() => {
    const supported = "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
    if (!supported) {
      // iOS exposes push only inside the installed (Home Screen) PWA.
      setStatus(isStandalone() ? "unsupported" : "needs-install");
      return;
    }
    if (Notification.permission === "denied") {
      setStatus("denied");
      return;
    }
    (async () => {
      try {
        const reg = await navigator.serviceWorker.getRegistration();
        const sub = reg ? await reg.pushManager.getSubscription() : null;
        setStatus(sub && Notification.permission === "granted" ? "enabled" : "idle");
      } catch {
        setStatus("idle");
      }
    })();
  }, []);

  async function enable() {
    setError("");
    setMsg("");
    setStatus("working");
    try {
      const reg = await navigator.serviceWorker.register("/sw.js");
      await navigator.serviceWorker.ready;
      const perm = await Notification.requestPermission();
      if (perm !== "granted") {
        setStatus(perm === "denied" ? "denied" : "idle");
        return;
      }
      const { key } = await (await fetch("/api/push/public-key")).json();
      if (!key) throw new Error("Push isn't set up on the server yet.");
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(key),
      });
      const res = await fetch("/api/push/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(sub.toJSON()),
      });
      if (!res.ok) throw new Error("Couldn't save the subscription.");
      setStatus("enabled");
      setMsg("Notifications are enabled on this device.");
    } catch (e) {
      setStatus("idle");
      setError(e instanceof Error ? e.message : "Couldn't enable notifications.");
    }
  }

  async function sendTest() {
    setError("");
    setMsg("");
    setTesting(true);
    try {
      const d = await (await fetch("/api/push/test", { method: "POST" })).json().catch(() => ({}));
      if (d.ok) setMsg(`Sent to ${d.sent} device${d.sent === 1 ? "" : "s"} — check your lock screen.`);
      else setError(d.error || "Couldn't send a test.");
    } catch {
      setError("Couldn't send a test.");
    } finally {
      setTesting(false);
    }
  }

  const btn = "rounded-md bg-brand-600 px-3.5 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-50";

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <h2 className="text-sm font-semibold text-slate-900">This device</h2>

      {status === "checking" && <p className="mt-2 text-sm text-slate-500">Checking…</p>}

      {status === "needs-install" && (
        <p className="mt-2 text-sm text-slate-600">
          To get notifications on your iPhone, first install PM Central: tap the <strong>Share</strong> button in Safari,
          then <strong>Add to Home Screen</strong>, and open the app from your Home Screen. Then come back here.
        </p>
      )}

      {status === "unsupported" && (
        <p className="mt-2 text-sm text-slate-600">
          This device or browser doesn&apos;t support push notifications. On iPhone you need iOS 16.4+ and the app added
          to your Home Screen.
        </p>
      )}

      {status === "denied" && (
        <p className="mt-2 text-sm text-amber-700">
          Notifications are blocked for PM Central. Turn them back on in your device/browser settings for this app, then
          reload this page.
        </p>
      )}

      {status === "idle" && (
        <div className="mt-2">
          <p className="mb-3 text-sm text-slate-600">Get a notification on this device. You&apos;ll be asked to allow notifications.</p>
          <button type="button" onClick={enable} className={btn}>
            Enable on this device
          </button>
        </div>
      )}

      {status === "working" && <p className="mt-2 text-sm text-slate-500">Enabling…</p>}

      {status === "enabled" && (
        <div className="mt-2">
          <p className="mb-3 text-sm font-medium text-emerald-700">✓ Notifications are on for this device.</p>
          <button type="button" onClick={sendTest} disabled={testing} className={btn}>
            {testing ? "Sending…" : "Send test notification"}
          </button>
        </div>
      )}

      {msg && <p className="mt-3 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-800">{msg}</p>}
      {error && <p className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">{error}</p>}
    </div>
  );
}
