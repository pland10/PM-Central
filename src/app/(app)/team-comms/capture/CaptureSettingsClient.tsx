"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";

// Opt-in controls for RingCentral capture. A person ticks which of their chats
// should be captured into Team Comms. Admins can manage anyone (person picker);
// a non-admin manages only the person their login is linked to.

type Person = { personId: string; personName: string | null };
type Chat = { chatId: string; chatName: string; chatType: string | null; include: boolean };

type Payload = {
  isAdmin: boolean;
  email: string | null;
  linkedPersonId: string | null;
  selectedPersonId: string | null;
  selectedName: string | null;
  captureAll: boolean;
  needsLink: boolean;
  people: Person[];
  chats: Chat[];
};

export function CaptureSettingsClient() {
  const [data, setData] = useState<Payload | null>(null);
  const [chats, setChats] = useState<Chat[]>([]);
  const [dirty, setDirty] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const load = useCallback(async (person?: string) => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`/api/team-comms/capture${person ? `?person=${encodeURIComponent(person)}` : ""}`);
      const d = (await res.json()) as Payload & { error?: string };
      if (!res.ok) throw new Error(d.error || `HTTP ${res.status}`);
      setData(d);
      setChats(d.chats || []);
      setDirty(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load capture settings.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  function toggle(chatId: string) {
    setChats((prev) => prev.map((c) => (c.chatId === chatId ? { ...c, include: !c.include } : c)));
    setDirty(true);
  }

  function setAll(include: boolean) {
    setChats((prev) => prev.map((c) => ({ ...c, include })));
    setDirty(true);
  }

  async function claim(personId: string) {
    setError("");
    try {
      const res = await fetch("/api/team-comms/capture", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "link", personId }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error || `HTTP ${res.status}`);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not link your account.");
    }
  }

  async function save() {
    if (!data?.selectedPersonId) return;
    setSaving(true);
    setError("");
    setNotice("");
    try {
      const res = await fetch("/api/team-comms/capture", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "prefs",
          personId: data.selectedPersonId,
          prefs: chats.map((c) => ({ chatId: c.chatId, include: c.include })),
        }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error || `HTTP ${res.status}`);
      setDirty(false);
      const n = chats.filter((c) => c.include).length;
      setNotice(`Saved — capturing ${n} chat${n === 1 ? "" : "s"}.`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed.");
    } finally {
      setSaving(false);
    }
  }

  const includedCount = chats.filter((c) => c.include).length;

  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-4">
        <Link href="/team-comms" className="text-sm text-brand-600 hover:underline">
          ← Team Comms
        </Link>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight">Capture settings</h1>
        <p className="mt-1 text-sm text-slate-500">
          Choose which RingCentral chats get captured into Team Comms. Nothing is captured until you
          tick it here.
        </p>
      </div>

      {error && (
        <div className="mb-3 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>
      )}

      {loading ? (
        <p className="text-sm text-slate-400">Loading…</p>
      ) : !data ? null : data.needsLink ? (
        // Non-admin who hasn't claimed their RingCentral identity yet.
        <div className="rounded-lg border border-slate-200 bg-white p-4">
          <p className="mb-3 text-sm text-slate-600">
            Which one is you? Pick your name so we can show your chats.
          </p>
          {data.people.length === 0 ? (
            <p className="text-sm text-slate-400">
              No RingCentral people yet — once your token is added and the sync runs, your name will
              appear here.
            </p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {data.people.map((p) => (
                <button
                  key={p.personId}
                  onClick={() => claim(p.personId)}
                  className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-700 hover:border-brand-500 hover:text-brand-600"
                >
                  {p.personName || p.personId}
                </button>
              ))}
            </div>
          )}
        </div>
      ) : (
        <>
          {/* Admin person picker */}
          {data.isAdmin && data.people.length > 0 && (
            <div className="mb-3 flex items-center gap-2">
              <span className="text-xs font-semibold uppercase tracking-wide text-slate-400">Person</span>
              <select
                value={data.selectedPersonId || ""}
                onChange={(e) => load(e.target.value)}
                className="rounded-md border border-slate-300 px-2 py-1 text-sm text-slate-700"
              >
                {data.people.map((p) => (
                  <option key={p.personId} value={p.personId}>
                    {p.personName || p.personId}
                  </option>
                ))}
              </select>
            </div>
          )}

          {data.captureAll && (
            <div className="mb-3 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
              This account captures <strong>all</strong> chats automatically — opt-in settings below
              don’t apply to it.
            </div>
          )}

          {!data.selectedPersonId ? (
            <p className="text-sm text-slate-400">No chats to show yet.</p>
          ) : (
            <div className="rounded-lg border border-slate-200 bg-white">
              <div className="flex items-center justify-between border-b border-slate-100 px-4 py-2">
                <div className="text-sm font-medium text-slate-700">
                  {data.selectedName || data.selectedPersonId}
                  <span className="ml-2 text-xs font-normal text-slate-400">
                    {includedCount} of {chats.length} captured
                  </span>
                </div>
                <div className="flex gap-2 text-xs">
                  <button onClick={() => setAll(true)} className="text-brand-600 hover:underline">
                    Select all
                  </button>
                  <span className="text-slate-300">·</span>
                  <button onClick={() => setAll(false)} className="text-slate-500 hover:underline">
                    None
                  </button>
                </div>
              </div>

              {chats.length === 0 ? (
                <p className="px-4 py-6 text-center text-sm text-slate-400">
                  No chats found for this person yet.
                </p>
              ) : (
                <ul className="divide-y divide-slate-100">
                  {chats.map((c) => (
                    <li key={c.chatId}>
                      <label className="flex cursor-pointer items-center gap-3 px-4 py-2.5 hover:bg-slate-50">
                        <input
                          type="checkbox"
                          checked={c.include}
                          onChange={() => toggle(c.chatId)}
                          className="h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500"
                        />
                        <span className="text-sm text-slate-700">{c.chatName}</span>
                        {c.chatType && c.chatType !== "Direct" && (
                          <span className="ml-auto text-xs text-slate-400">{c.chatType}</span>
                        )}
                      </label>
                    </li>
                  ))}
                </ul>
              )}

              <div className="flex items-center justify-between border-t border-slate-100 px-4 py-3">
                <span className="text-xs text-slate-400">{notice}</span>
                <button
                  onClick={save}
                  disabled={!dirty || saving}
                  className="rounded-md bg-brand-500 px-4 py-1.5 text-sm font-medium text-white hover:bg-brand-600 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {saving ? "Saving…" : "Save"}
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
