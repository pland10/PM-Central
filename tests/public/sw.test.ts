import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";

// Runs public/sw.js against a fake service-worker global and fires a push.
function loadWorker() {
  const listeners: Record<string, (e: unknown) => void> = {};
  const showNotification = vi.fn(async () => undefined);
  const self = {
    addEventListener: (type: string, fn: (e: unknown) => void) => (listeners[type] = fn),
    registration: { showNotification },
    clients: { claim: vi.fn(), matchAll: vi.fn(async () => []) },
    skipWaiting: vi.fn(),
  };
  const src = readFileSync(join(process.cwd(), "public/sw.js"), "utf8");
  new Function("self", src)(self);
  const push = async (data: unknown) => {
    let done: Promise<unknown> = Promise.resolve();
    listeners.push({ data: { json: () => data, text: () => JSON.stringify(data) }, waitUntil: (p: Promise<unknown>) => (done = p) });
    await done;
    return showNotification.mock.calls.at(-1) as unknown as [string, Record<string, unknown>];
  };
  return { push };
}

describe("public/sw.js — push", () => {
  it("shows the notification with its title, body, link and tag", async () => {
    const [title, opts] = await loadWorker().push({ title: "Draws ready to batch", body: "2 new", url: "/accounting/rentvine", tag: "batch_ready" });
    expect(title).toBe("Draws ready to batch");
    expect(opts).toMatchObject({ body: "2 new", tag: "batch_ready", data: { url: "/accounting/rentvine" } });
  });

  it("pops up again when it replaces an earlier one with the same tag (not a silent swap)", async () => {
    const [, opts] = await loadWorker().push({ title: "PM Central", body: "test", tag: "pmc-test" });
    expect(opts.renotify).toBe(true);
  });

  it("doesn't set renotify without a tag (browsers reject that)", async () => {
    const [, opts] = await loadWorker().push({ title: "PM Central", body: "hi" });
    expect(opts.renotify).toBeUndefined();
  });
});
